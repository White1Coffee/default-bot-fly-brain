class CombatBrain {
  constructor(options, maybeState, maybeKnowledge) {
    const dependencies = options?.bot
      ? options
      : { bot: options, state: maybeState, knowledge: maybeKnowledge }
    this.bot = dependencies.bot
    this.state = dependencies.state
    this.knowledge = dependencies.knowledge
    this.navigation = dependencies.navigation || null
    this.inventory = dependencies.inventory || null
    this.playerPvpEnabledProvider = dependencies.playerPvpEnabled || null
    this.phase = 'idle'
    this.target = null
    this.lastDecisionAt = 0
    this.lastStrafeAt = 0
    this.strafeSide = 'left'
    this.comboUntil = 0
    this.lastRangedAt = 0
    this.lastShieldAt = 0
    this.lastPearlAt = 0
    this.lastLavaAt = 0
    this.lastWaterAt = 0
    this.lastGappleAt = 0
    this.lastTotemAt = 0
    this.reengageAt = 0
    this.fightStats = this.knowledge.combat.fights ||= {
      wins: 0,
      losses: 0,
      lostReasons: {},
      learned: {}
    }
  }

  async tick(target) {
    if (!target?.position || !this.bot.entity || target.isValid === false) return false
    this.target = target.username || target.name || 'target'
    const distance = target.position.distanceTo(this.bot.entity.position)

    this.rememberTargetScore(target)
    await this.equipTotemOrShield()

    if (this.isHostileMob(target)) {
      return this.tickMobCombat(target)
    }

    if (target.type === 'player' && !this.playerPvpEnabled() && !this.state.hitmanTask && !this.state.retaliationTask) {
      return false
    }

    if (await this.retreatHeal(target)) return true
    if (Date.now() < this.reengageAt) return true
    if (await this.waterClutchOrSpacing(target)) return true

    if (distance > 15 && distance < 36 && this.hasBow()) {
      this.setPhase('bow prediction', target, { distance })
      return this.fireBowPrediction(target)
    }

    if (distance <= 4 && await this.lavaPressure(target)) return true
    if (await this.axeShieldBreak(target)) return true

    if (distance > 4.1) {
      if (distance > 14 && this.bot.health >= 14 && await this.pearl(target, 'engage')) return true
      this.setPhase('closing distance', target, { distance })
      if (this.navigation?.gotoNear) this.navigation.gotoNear(target.position, 2)
      else this.bot.pathfinder?.setGoal?.(this.goalNear(target, 2), true)
      return true
    }

    this.setPhase('strafe combo', target, { distance })
    await this.equipBestMelee(target)
    this.strafe(target)
    await this.criticalOrTimedHit(target)
    return true
  }

  targetScore(entity) {
    if (!entity?.position || entity.username === this.bot.username) return -Infinity
    const distance = entity.position.distanceTo(this.bot.entity.position)
    const health = Number(entity.health ?? 20)
    let score = 100 - distance * 3 + (20 - health) * 2
    if (this.usesShield(entity)) score += 25
    if (this.state.hitmanTask && entity.username?.toLowerCase() === this.state.hitmanTask.playerName?.toLowerCase()) score += 1000
    if (this.state.lastDamage?.cause?.includes(entity.username || '')) score += 120
    return score
  }

  bestTarget(range = 32) {
    if (!this.bot.entity) return null
    return Object.values(this.bot.entities || {})
      .filter(entity => entity?.type === 'player' && entity.username !== this.bot.username && entity.position?.distanceTo(this.bot.entity.position) <= range)
      .sort((left, right) => this.targetScore(right) - this.targetScore(left))[0] || null
  }

  playerPvpEnabled() {
    if (typeof this.playerPvpEnabledProvider === 'function') return Boolean(this.playerPvpEnabledProvider())
    return Boolean(this.state.playerPvpEnabled)
  }

  isHostileMob(entity) {
    if (!entity || entity.type !== 'mob') return false
    return [
      'zombie', 'husk', 'drowned', 'zombie_villager',
      'skeleton', 'stray', 'bogged',
      'creeper',
      'spider', 'cave_spider',
      'witch', 'slime', 'magma_cube', 'phantom',
      'pillager', 'vindicator', 'evoker', 'ravager', 'vex',
      'warden', 'enderman', 'silverfish', 'endermite',
      'blaze', 'ghast', 'wither_skeleton', 'zoglin', 'hoglin', 'piglin_brute', 'shulker'
    ].includes(entity.name)
  }

  mobThreatType(entity) {
    const name = entity?.name
    if (['zombie', 'husk', 'drowned', 'zombie_villager', 'wither_skeleton', 'hoglin', 'zoglin', 'piglin_brute'].includes(name)) return 'melee'
    if (['skeleton', 'stray', 'bogged', 'pillager', 'blaze', 'ghast', 'shulker', 'witch'].includes(name)) return 'ranged'
    if (name === 'creeper') return 'explosion'
    if (['spider', 'cave_spider', 'silverfish', 'endermite', 'vex', 'phantom'].includes(name)) return 'fast_melee'
    if (['warden', 'ravager', 'evoker'].includes(name)) return 'elite'
    if (name === 'enderman') return 'avoid_eye_contact'
    return 'melee'
  }

  nearbyHostileCount(radius = 8) {
    if (!this.bot.entity) return 0
    return Object.values(this.bot.entities || {})
      .filter(entity => this.isHostileMob(entity) && entity.position?.distanceTo(this.bot.entity.position) <= radius)
      .length
  }

  async tickMobCombat(target) {
    if (!target?.position || !this.bot.entity) return false
    const distance = target.position.distanceTo(this.bot.entity.position)
    const threatType = this.mobThreatType(target)
    const nearbyCount = this.nearbyHostileCount(8)

    if (this.bot.health <= 10 || nearbyCount >= 3) {
      this.setPhase(this.bot.health <= 10 ? 'pve retreat + heal' : 'pve retreat from mob group', target, { distance, nearbyCount, threatType })
      await this.shield(350)
      await this.retreatFrom(target, this.bot.health <= 10 ? 950 : 1250)
      if (await this.gapple()) this.reengageAt = Date.now() + 1200
      return true
    }

    if (threatType === 'explosion') return this.avoidCreeper(target)
    if (target.name === 'skeleton' || target.name === 'stray' || target.name === 'bogged') return this.fightSkeleton(target)
    if (['zombie', 'husk', 'drowned', 'zombie_villager'].includes(target.name)) return this.fightZombie(target)
    if (threatType === 'fast_melee') return this.fightFastMelee(target)
    if (threatType === 'ranged') return this.fightSkeleton(target)
    if (threatType === 'elite' || threatType === 'avoid_eye_contact') {
      this.setPhase(`pve avoid ${target.name}`, target, { distance, threatType })
      return this.retreatFrom(target, 1200)
    }
    return this.fightZombie(target)
  }

  async fightSkeleton(target) {
    const distance = target.position.distanceTo(this.bot.entity.position)
    this.setPhase('pve skeleton shield zigzag', target, { distance })
    await this.equipBestMelee(target)

    if (this.hasLineOfSight(target) && distance <= 16) {
      this.raiseShield()
    }

    this.zigzag(target, {
      forward: distance > 3.3,
      back: distance < 2.4,
      sprint: distance > 5
    })

    if (distance > 3.5) {
      this.moveNear(target, 2.8)
      return true
    }

    try { this.bot.deactivateItem() } catch {}
    if (this.canHit(target)) await this.criticalOrTimedHit(target)
    return true
  }

  async fightZombie(target) {
    const distance = target.position.distanceTo(this.bot.entity.position)
    this.setPhase('pve zombie spacing', target, { distance })
    await this.equipBestMelee(target)
    this.bot.pvp?.stop?.()
    try { this.bot.deactivateItem() } catch {}

    this.bot.setControlState('sprint', true)
    this.bot.setControlState('left', this.strafeSide === 'left')
    this.bot.setControlState('right', this.strafeSide === 'right')
    this.bot.setControlState('back', distance < 2.8)
    this.bot.setControlState('forward', distance > 3.4)
    if (Date.now() - this.lastStrafeAt > 550) {
      this.strafeSide = this.strafeSide === 'left' ? 'right' : 'left'
      this.lastStrafeAt = Date.now()
    }

    if (distance <= 3.6 && distance >= 2.4 && this.canHit(target)) await this.criticalOrTimedHit(target)
    else if (distance > 4.2) this.moveNear(target, 3)
    return true
  }

  async fightFastMelee(target) {
    const distance = target.position.distanceTo(this.bot.entity.position)
    this.setPhase('pve fast melee spacing', target, { distance })
    await this.equipBestMelee(target)
    this.bot.setControlState('sprint', true)
    this.bot.setControlState('back', distance < 3)
    this.bot.setControlState(this.strafeSide, true)
    if (distance <= 3.8 && this.canHit(target)) await this.criticalOrTimedHit(target)
    else if (distance > 4.5) this.moveNear(target, 3)
    return true
  }

  async avoidCreeper(target) {
    const distance = target.position.distanceTo(this.bot.entity.position)
    this.setPhase('pve creeper spacing', target, { distance })
    await this.equipBestMelee(target)
    if (distance < 6) {
      await this.retreatFrom(target, 1100)
      return true
    }
    if (distance <= 4.1 && this.bot.health >= 14 && this.canHit(target)) {
      await this.criticalOrTimedHit(target)
      await this.retreatFrom(target, 650)
      return true
    }
    if (distance > 6 && distance < 10) this.moveNear(target, 5.5)
    return true
  }

  async retreatFrom(target, ms = 700) {
    if (!target?.position || !this.bot.entity) return false
    this.bot.pvp?.stop?.()
    try { this.bot.deactivateItem() } catch {}
    const side = this.strafeSide === 'left' ? 'right' : 'left'
    this.bot.setControlState('sprint', true)
    this.bot.setControlState('back', true)
    this.bot.setControlState(side, true)
    if (this.bot.entity.onGround) this.bot.setControlState('jump', true)
    try {
      await this.bot.lookAt(target.position.offset(0, Math.min(target.height || 1.4, 1.4), 0), true)
      await this.sleep(ms)
      return true
    } finally {
      this.bot.clearControlStates()
    }
  }

  setPhase(phase, target, extra = {}) {
    this.phase = phase
    this.lastDecisionAt = Date.now()
    this.state.eliteCombat ||= {}
    Object.assign(this.state.eliteCombat, {
      phase,
      target: target?.username || target?.name || null,
      lastDecisionAt: this.lastDecisionAt,
      ...extra
    })
    this.state.currentTask = {
      type: this.isHostileMob(target) ? 'elite_pve' : 'elite_pvp',
      detail: phase,
      target: this.state.eliteCombat.target,
      updatedAt: new Date().toISOString()
    }
  }

  rememberTargetScore(target) {
    this.knowledge.combat.targetScores ||= {}
    const key = target.username || target.name || 'unknown'
    this.knowledge.combat.targetScores[key] = {
      score: Math.round(this.targetScore(target)),
      lastSeenAt: Date.now()
    }
  }

  learnLostFight(reason, amount = 1) {
    this.fightStats.losses += amount
    this.fightStats.lostReasons[reason] = (this.fightStats.lostReasons[reason] || 0) + amount
    this.fightStats.learned[reason] = (this.fightStats.learned[reason] || 0) + amount
  }

  usesShield(entity) {
    return Boolean(entity?.equipment?.some(item => item?.name === 'shield'))
  }

  item(name) {
    return this.inventory?.find?.(name) || this.bot.inventory.items().find(item => item.name === name)
  }

  hasItem(name) {
    return this.inventory?.has?.(name) || Boolean(this.item(name))
  }

  async equip(item, destination = 'hand') {
    if (!item) return false
    try {
      await this.bot.equip(item, destination)
      return true
    } catch {
      return false
    }
  }

  async equipTotemOrShield() {
    const totem = this.item('totem_of_undying')
    if (this.bot.health <= 10 && totem && Date.now() - this.lastTotemAt > 1000) {
      if (await this.equip(totem, 'off-hand')) {
        this.lastTotemAt = Date.now()
        return true
      }
    }
    return this.equip(this.item('shield'), 'off-hand')
  }

  raiseShield() {
    const shield = this.item('shield')
    if (!shield || Date.now() - this.lastShieldAt < 500) return false
    this.equip(shield, 'off-hand').then(equipped => {
      if (!equipped) return
      try {
        this.lastShieldAt = Date.now()
        this.bot.activateItem(true)
      } catch {}
    }).catch(() => {})
    return true
  }

  weaponScore(name) {
    const material = { netherite: 60, diamond: 50, iron: 40, stone: 25, golden: 18, wood: 10, wooden: 10 }
    const type = { sword: 12, axe: 10, bow: 7, crossbow: 7, trident: 12 }
    const materialScore = Object.entries(material).find(([key]) => name.includes(key))?.[1] || 0
    const typeScore = Object.entries(type).find(([key]) => name.includes(key))?.[1] || 0
    return materialScore + typeScore
  }

  bestMelee(target) {
    const preferred = this.usesShield(target) ? '_axe' : '_sword'
    return this.bot.inventory.items()
      .filter(item => item.name.endsWith(preferred))
      .sort((left, right) => this.weaponScore(right.name) - this.weaponScore(left.name))[0] ||
      this.bot.inventory.items()
        .filter(item => /_(sword|axe)$/.test(item.name))
        .sort((left, right) => this.weaponScore(right.name) - this.weaponScore(left.name))[0] ||
      null
  }

  async equipBestMelee(target) {
    return this.equip(this.bestMelee(target), 'hand')
  }

  hasBow() {
    return this.bot.inventory.items().some(item => ['bow', 'crossbow'].includes(item.name)) &&
      this.bot.inventory.items().some(item => ['arrow', 'spectral_arrow', 'tipped_arrow'].includes(item.name))
  }

  bestBow() {
    return this.item('crossbow') || this.item('bow')
  }

  predictedAim(entity, weapon) {
    const target = entity.position.offset(0, Math.min(entity.height || 1.5, 1.5), 0)
    if (!entity.velocity || !this.bot.entity) return target
    const distance = entity.position.distanceTo(this.bot.entity.position)
    const flightSeconds = Math.min(1.25, distance / (weapon?.name === 'crossbow' ? 32 : 25))
    return target.offset(
      entity.velocity.x * flightSeconds * 20,
      entity.velocity.y * flightSeconds * 20 + Math.min(2, distance * distance / 900),
      entity.velocity.z * flightSeconds * 20
    )
  }

  async fireBowPrediction(target) {
    if (Date.now() - this.lastRangedAt < 1400) return false
    const weapon = this.bestBow()
    if (!weapon) return false
    try {
      this.lastRangedAt = Date.now()
      this.bot.pvp?.stop?.()
      this.bot.clearControlStates()
      await this.equip(weapon, 'hand')
      await this.bot.lookAt(this.predictedAim(target, weapon), true)
      this.bot.activateItem()
      await this.sleep(weapon.name === 'crossbow' ? 1250 : 1050)
      await this.bot.lookAt(this.predictedAim(target, weapon), true)
      this.bot.deactivateItem()
      return true
    } catch {
      try { this.bot.deactivateItem() } catch {}
      this.learnLostFight('ranged_failed')
      return false
    }
  }

  strafe(target) {
    const now = Date.now()
    if (now - this.lastStrafeAt > 650) {
      this.strafeSide = this.strafeSide === 'left' ? 'right' : 'left'
      this.lastStrafeAt = now
    }
    const distance = target.position.distanceTo(this.bot.entity.position)
    this.bot.setControlState('sprint', true)
    this.bot.setControlState('left', this.strafeSide === 'left')
    this.bot.setControlState('right', this.strafeSide === 'right')
    this.bot.setControlState('forward', distance > 2.9)
    this.bot.setControlState('back', distance < 2.15)
    this.bot.setControlState('jump', Date.now() < this.comboUntil && distance <= 3.4 && this.bot.entity.onGround && this.bot.health >= 12)
  }

  zigzag(target, options = {}) {
    const now = Date.now()
    if (now - this.lastStrafeAt > 420) {
      this.strafeSide = this.strafeSide === 'left' ? 'right' : 'left'
      this.lastStrafeAt = now
    }
    this.bot.pvp?.stop?.()
    this.bot.setControlState('sprint', Boolean(options.sprint))
    this.bot.setControlState('left', this.strafeSide === 'left')
    this.bot.setControlState('right', this.strafeSide === 'right')
    this.bot.setControlState('forward', Boolean(options.forward))
    this.bot.setControlState('back', Boolean(options.back))
    this.bot.setControlState('jump', Boolean(options.sprint && this.bot.entity.onGround && target.position.distanceTo(this.bot.entity.position) > 5))
  }

  hasLineOfSight(target) {
    if (!target?.position || !this.bot.entity) return false
    const eye = this.bot.entity.position.offset(0, 1.62, 0)
    const aim = target.position.offset(0, Math.min(target.height || 1.5, 1.5), 0)
    const delta = aim.minus(eye)
    return !this.bot.world.raycast(eye, delta.normalize(), delta.norm())
  }

  moveNear(target, range = 3) {
    if (!target?.position) return false
    try {
      if (this.navigation?.gotoNear) {
        this.navigation.gotoNear(target.position, range)
        return true
      }
      this.bot.pathfinder?.setGoal?.(this.goalNear(target, range), true)
      return true
    } catch {
      return false
    }
  }

  canHit(target) {
    if (!target?.position || !this.bot.entity || target.position.distanceTo(this.bot.entity.position) > 4.2) return false
    const eye = this.bot.entity.position.offset(0, 1.62, 0)
    const aim = target.position.offset(0, Math.min(target.height || 1, 1), 0)
    const delta = aim.minus(eye)
    return !this.bot.world.raycast(eye, delta.normalize(), delta.norm())
  }

  async criticalOrTimedHit(target) {
    if (!this.canHit(target)) return false
    await this.bot.lookAt(target.position.offset(0, Math.min(target.height || 1.6, 1.6), 0), true)
    if (this.bot.health >= 12 && this.bot.food >= 10 && this.bot.entity.onGround) {
      this.bot.setControlState('jump', true)
      await this.sleep(90)
      this.bot.setControlState('jump', false)
      await this.sleep(120)
    }
    if (!this.canHit(target)) return false
    this.bot.attack(target)
    this.comboUntil = Date.now() + 1600
    return true
  }

  async axeShieldBreak(target) {
    if (!this.usesShield(target)) return false
    const axe = this.bot.inventory.items()
      .filter(item => item.name.endsWith('_axe'))
      .sort((left, right) => this.weaponScore(right.name) - this.weaponScore(left.name))[0]
    if (!axe) return false
    this.setPhase('axe shield-break', target)
    await this.equip(axe, 'hand')
    this.strafe(target)
    if (!this.canHit(target)) return false
    this.bot.attack(target)
    this.comboUntil = Date.now() + 1800
    return true
  }

  async retreatHeal(target) {
    const mustRetreat = this.bot.health <= 8 || this.bot.food <= 6
    if (!mustRetreat) return false
    this.setPhase('retreat + heal', target)
    this.bot.pvp?.stop?.()
    await this.shield(450)
    if (await this.gapple()) {
      this.reengageAt = Date.now() + 1200
      return true
    }
    if (this.bot.health <= 6 && await this.pearl(target, 'retreat')) {
      this.reengageAt = Date.now() + 2500
      return true
    }
    this.bot.setControlState('back', true)
    this.bot.setControlState(this.strafeSide, true)
    await this.sleep(700)
    this.bot.clearControlStates()
    this.reengageAt = Date.now() + 900
    this.learnLostFight('forced_retreat')
    return true
  }

  async shield(ms = 350) {
    if (Date.now() - this.lastShieldAt < 850) return false
    const shield = this.item('shield')
    if (!shield || !await this.equip(shield, 'off-hand')) return false
    try {
      this.lastShieldAt = Date.now()
      this.bot.activateItem(true)
      await this.sleep(ms)
      return true
    } finally {
      try { this.bot.deactivateItem() } catch {}
    }
  }

  async gapple() {
    if (this.bot.health > 13 || Date.now() - this.lastGappleAt < 9000) return false
    const gapple = this.item('enchanted_golden_apple') || this.item('golden_apple')
    if (!gapple) return false
    try {
      await this.equip(gapple, 'hand')
      await this.bot.consume()
      this.lastGappleAt = Date.now()
      return true
    } catch {
      return false
    }
  }

  async pearl(target, mode = 'retreat') {
    if (Date.now() - this.lastPearlAt < 12000) return false
    const pearl = this.item('ender_pearl')
    if (!pearl || !target?.position) return false
    const away = this.bot.entity.position.minus(target.position)
    const length = Math.max(0.1, Math.hypot(away.x, away.z))
    const aim = mode === 'engage'
      ? target.position.offset(0, 1.2, 0)
      : this.bot.entity.position.offset((away.x / length) * 18, 1.2, (away.z / length) * 18)
    try {
      this.setPhase(`${mode} pearl`, target)
      await this.equip(pearl, 'hand')
      await this.bot.lookAt(aim, true)
      this.bot.activateItem()
      this.lastPearlAt = Date.now()
      return true
    } catch {
      this.learnLostFight('pearl_failed')
      return false
    }
  }

  async lavaPressure(target) {
    if (Date.now() - this.lastLavaAt < 10000 || target.position.distanceTo(this.bot.entity.position) > 4 || this.bot.health < 12) return false
    const lava = this.item('lava_bucket')
    if (!lava) return false
    const below = this.bot.blockAt(target.position.floored().offset(0, -1, 0))
    if (!below || below.boundingBox !== 'block') return false
    try {
      this.setPhase('lava pressure', target)
      await this.equip(lava, 'hand')
      await this.bot.lookAt(below.position.offset(0.5, 1, 0.5), true)
      this.bot.activateItem()
      this.lastLavaAt = Date.now()
      return true
    } catch {
      return false
    }
  }

  async waterClutchOrSpacing(target) {
    if (Date.now() - this.lastWaterAt < 5000) return false
    const water = this.item('water_bucket')
    if (!water || !this.bot.entity) return false
    const feet = this.bot.entity.position.floored()
    const inLava = ['lava', 'fire'].includes(this.bot.blockAt(feet)?.name) || ['lava', 'fire'].includes(this.bot.blockAt(feet.offset(0, -1, 0))?.name)
    const spacing = target?.position && target.position.distanceTo(this.bot.entity.position) < 3 && this.bot.health <= 12
    if (!inLava && !spacing) return false
    const below = this.bot.blockAt(feet.offset(0, -1, 0))
    if (!below || below.boundingBox !== 'block') return false
    try {
      this.setPhase(inLava ? 'water clutch' : 'water spacing', target)
      await this.equip(water, 'hand')
      await this.bot.lookAt(below.position.offset(0.5, 1, 0.5), true)
      this.bot.activateItem()
      this.lastWaterAt = Date.now()
      return true
    } catch {
      return false
    }
  }

  goalNear(target, range) {
    const GoalNear = this.bot.pathfinder?.goals?.GoalNear || require('mineflayer-pathfinder').goals.GoalNear
    return new GoalNear(target.position.x, target.position.y, target.position.z, range)
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

module.exports = { CombatBrain }
