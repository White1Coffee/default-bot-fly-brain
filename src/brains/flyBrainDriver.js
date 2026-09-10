const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

class FlyBrainDriver {
  constructor({ bot, appRoot, log = console.log }) {
    this.bot = bot
    this.appRoot = appRoot
    this.log = log
    this.enabled = false
    this.ready = false
    this.proc = null
    this.pending = []
    this.latest = null
    this.lastError = ''
    this.lastTickAt = 0
    this.lastYaw = 0
    this.lastPitch = 0
    this.lastHealth = null
    this.lastCommandAt = 0
    this.intent = { action: 'idle', priority: 0, reason: 'startup' }
    this.lastInputs = null
    this.building = false
  }

  status() {
    return {
      enabled: this.enabled,
      ready: this.ready,
      pid: this.proc?.pid || null,
      latest: this.latest,
      intent: this.intent,
      inputs: this.lastInputs,
      phase: 4,
      lastError: this.lastError || null,
      lastCommandAt: this.lastCommandAt || null
    }
  }

  async setEnabled(enabled) {
    this.enabled = Boolean(enabled)
    if (!this.enabled) {
      this.stopControls()
      return true
    }
    await this.ensureStarted()
    return this.ready
  }

  async ensureStarted() {
    if (this.proc && !this.proc.killed) return
    await this.ensureBuilt()
    const javaExe = process.env.JAVA_EXE || 'java'
    const buildRoot = path.join(this.appRoot, 'external', 'fly-brain-build')
    const flyb = path.join(this.appRoot, 'external', 'fly-brain-minecraft', 'src', 'main', 'resources', 'connectome', 'malecns-v1.0.flyb.gz')
    this.ready = false
    this.lastError = ''
    this.proc = spawn(javaExe, [
      '-Xmx2g',
      '-cp',
      buildRoot,
      'com.fruitfly.brain.tools.FlyBrainBridge',
      '--flyb',
      flyb
    ], { cwd: this.appRoot, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })

    let buffer = ''
    this.proc.stdout.on('data', chunk => {
      buffer += chunk.toString('utf8')
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() || ''
      for (const line of lines) this.handleLine(line)
    })
    this.proc.stderr.on('data', chunk => {
      const text = chunk.toString('utf8').trim()
      if (text) {
        this.lastError = text.slice(-500)
        this.log(`[FlyBrain] ${this.lastError}`)
      }
    })
    this.proc.on('exit', code => {
      this.ready = false
      this.proc = null
      this.stopControls()
      if (this.enabled) this.lastError = `fly brain exited with code ${code}`
    })
  }

  async ensureBuilt() {
    const sourceRoot = path.join(this.appRoot, 'external', 'fly-brain-minecraft', 'src', 'main', 'java')
    const buildRoot = path.join(this.appRoot, 'external', 'fly-brain-build')
    const bridgeClass = path.join(buildRoot, 'com', 'fruitfly', 'brain', 'tools', 'FlyBrainBridge.class')
    const bridgeSource = path.join(sourceRoot, 'com', 'fruitfly', 'brain', 'tools', 'FlyBrainBridge.java')
    if (fs.existsSync(bridgeClass) && fs.statSync(bridgeClass).mtimeMs >= fs.statSync(bridgeSource).mtimeMs) return
    if (this.building) return
    this.building = true
    fs.mkdirSync(buildRoot, { recursive: true })
    const sources = [
      ...fs.readdirSync(path.join(sourceRoot, 'com', 'fruitfly', 'brain'))
        .filter(name => name.endsWith('.java'))
        .map(name => path.join(sourceRoot, 'com', 'fruitfly', 'brain', name)),
      bridgeSource
    ]
    await new Promise((resolve, reject) => {
      const javac = spawn(process.env.JAVAC_EXE || 'javac', ['-d', buildRoot, ...sources], { cwd: this.appRoot, windowsHide: true })
      let errText = ''
      javac.stderr.on('data', chunk => { errText += chunk.toString('utf8') })
      javac.on('error', reject)
      javac.on('exit', code => code === 0 ? resolve() : reject(new Error(errText || `javac exited with code ${code}`)))
    }).finally(() => {
      this.building = false
    })
  }

  handleLine(line) {
    if (!line.trim()) return
    try {
      const data = JSON.parse(line)
      if (data.ready) {
        this.ready = true
        return
      }
      if (data.error) {
        this.lastError = data.error
        return
      }
      this.latest = data
      this.lastCommandAt = Date.now()
      this.applyMotor(data)
    } catch (err) {
      this.lastError = `bad bridge output: ${line.slice(0, 120)}`
    }
  }

  async tick() {
    if (!this.enabled || !this.bot.entity) return false
    await this.ensureStarted()
    if (!this.proc?.stdin || !this.ready) return true
    const now = Date.now()
    if (now - this.lastTickAt < 120) return true
    this.lastTickAt = now
    const frame = this.encodeFrame()
    try {
      this.proc.stdin.write(`${frame}\n`)
    } catch (err) {
      this.lastError = err.message
    }
    return true
  }

  encodeFrame() {
    const yaw = this.bot.entity?.yaw || 0
    const pitch = this.bot.entity?.pitch || 0
    const yawRate = ((yaw - this.lastYaw) * 180 / Math.PI) / 0.12
    const pitchRate = ((pitch - this.lastPitch) * 180 / Math.PI) / 0.12
    this.lastYaw = yaw
    this.lastPitch = pitch

    const health = Number(this.bot.health || 20)
    const damage = this.lastHealth === null ? 0 : Math.max(0, Math.min(1, (this.lastHealth - health) / 8))
    this.lastHealth = health

    const food = Number(this.bot.food || 20)
    const ambient = this.ambientLight()
    const nearest = this.nearestVisibleEntity()
    const nearestDrop = this.nearestDroppedItem()
    const nearestBlock = this.nearestInterestingBlock()
    const wind = Math.min(1, Math.max(0, Math.abs(this.bot.entity?.velocity?.x || 0) + Math.abs(this.bot.entity?.velocity?.z || 0)))
    const airborne = this.bot.entity?.onGround === false
    const blocked = Boolean(this.latest && Number(this.latest.forward || 0) > 0.1 && wind < 0.03 && !airborne)
    const inventory = this.inventorySummary()
    const objects = nearest ? [nearest].map(objectLine).join('|') : ''
    this.lastInputs = {
      health,
      food,
      ambient,
      damage,
      wind,
      airborne,
      blocked,
      inventoryUsedSlots: inventory.usedSlots,
      inventoryFullness: Number(inventory.fullness.toFixed(2)),
      hasCraftingTable: inventory.craftingTable > 0,
      hasLogs: inventory.logs > 0,
      hasPickaxe: inventory.pickaxes > 0,
      buildBlocks: inventory.buildingBlocks,
      nearest: nearest ? { name: nearest.name, type: nearest.type, distance: Number(nearest.distance.toFixed(1)), hostile: nearest.hostile } : null,
      nearestDrop,
      nearestBlock
    }
    this.intent = this.computeIntent({ health, food, damage, nearest, nearestDrop, nearestBlock, inventory, wind, airborne, blocked })
    const odor = food <= 12 ? 'DM1:0.8,DM2:0.5,VA2:0.4' : ''
    const taste = food <= 8 ? 'LgLG3:0.7' : ''
    return [
      `ambient=${ambient.toFixed(2)}`,
      `damage=${damage.toFixed(2)}`,
      `windLeft=${wind.toFixed(2)}`,
      `windRight=${wind.toFixed(2)}`,
      `airborne=${airborne}`,
      `yawRate=${yawRate.toFixed(2)}`,
      `pitchRate=${pitchRate.toFixed(2)}`,
      `touchHead=${damage > 0 ? 0.5 : 0}`,
      `touchLegs=${airborne ? 0 : 0.2}`,
      `groomDust=0`,
      `odor=${odor}`,
      `taste=${taste}`,
      `objects=${objects}`
    ].join(';')
  }

  ambientLight() {
    const time = Number(this.bot.time?.timeOfDay || 6000)
    const dayDistance = Math.min(Math.abs(time - 6000), Math.abs(time - 30000))
    return Math.max(0.08, Math.min(0.9, 0.9 - (dayDistance / 12000) * 0.75))
  }

  nearestVisibleEntity() {
    if (!this.bot.entity) return null
    let best = null
    for (const entity of Object.values(this.bot.entities || {})) {
      if (!entity?.position || entity === this.bot.entity) continue
      const distance = entity.position.distanceTo(this.bot.entity.position)
      if (distance > 16 || distance < 0.1) continue
      const kind = entity.type === 'player' ? 'player' : entity.name || entity.mobType || ''
      const hostile = /zombie|skeleton|creeper|spider|enderman|witch|slime|guardian|phantom|drowned|pillager|vindicator|evoker|warden|blaze|ghast|hoglin|piglin_brute/i.test(kind)
      const score = (hostile ? 100 : 0) + (16 - distance)
      if (!best || score > best.score) {
        const delta = entity.position.minus(this.bot.entity.position)
        const targetYaw = Math.atan2(-delta.x, -delta.z)
        const yawDiff = wrapRadians(targetYaw - this.bot.entity.yaw)
        best = {
          score,
          name: entity.username || entity.name || 'entity',
          type: entity.type || entity.name || 'entity',
          distance,
          hostile,
          azimuth: Math.max(-120, Math.min(120, yawDiff * 180 / Math.PI)),
          elevation: Math.max(-60, Math.min(60, Math.atan2(delta.y, Math.max(0.1, Math.sqrt(delta.x * delta.x + delta.z * delta.z))) * 180 / Math.PI)),
          size: Math.max(3, Math.min(70, 55 / distance)),
          expansion: hostile ? Math.max(0, 80 / distance) : 0,
          speed: Math.min(180, ((Math.abs(entity.velocity?.x || 0) + Math.abs(entity.velocity?.z || 0)) * 90)),
          flyLike: entity.type === 'player'
        }
      }
    }
    return best
  }


  computeIntent({ health, food, damage, nearest, nearestDrop, nearestBlock, inventory, wind, airborne, blocked }) {
    const hunger = Math.max(0, Math.min(1, (14 - Number(food || 20)) / 10))
    const lowHealth = Math.max(0, Math.min(1, (14 - Number(health || 20)) / 10))
    const proximityDanger = nearest?.hostile ? Math.max(0, Math.min(1, (16 - Number(nearest.distance || 16)) / 16)) : 0
    const danger = Math.max(Number(damage || 0), lowHealth, proximityDanger)
    const inv = inventory || this.inventorySummary()
    const inventoryFullness = Number(inv.fullness || 0)
    const explorationDrive = Math.max(0, Math.min(1, 0.15 + (Number(wind || 0) < 0.04 ? 0.25 : 0) + (nearestBlock ? 0.1 : 0) + (nearestDrop ? 0.1 : 0) - danger * 0.5 - hunger * 0.4))
    const restDrive = Math.max(0, Math.min(1, (health >= 19 ? 0.25 : 0) + (food >= 18 ? 0.25 : 0) - (nearest ? 0.12 : 0) - danger))

    if (danger >= 0.78 && nearest?.hostile && nearest.distance <= 4.5 && health >= 10) {
      return {
        action: 'attack_entity',
        priority: Number(danger.toFixed(2)),
        reason: 'attack reflex against ' + nearest.name,
        target: { name: nearest.name, type: nearest.type, distance: Number(nearest.distance.toFixed(1)), hostile: true }
      }
    }
    if (danger >= 0.55 && (nearest?.hostile || damage > 0)) {
      return {
        action: 'retreat_from_entity',
        priority: Number(danger.toFixed(2)),
        reason: nearest?.hostile ? `hostile ${nearest.name} nearby` : (damage > 0 ? 'damage spike' : 'low health'),
        target: nearest ? { name: nearest.name, type: nearest.type, distance: Number(nearest.distance.toFixed(1)), hostile: nearest.hostile } : null
      }
    }
    if (health <= 14 && (!nearest?.hostile || damage > 0)) {
      return {
        action: 'equip_item',
        priority: Number(Math.max(0.5, lowHealth).toFixed(2)),
        reason: 'danger calls for armor and weapon',
        target: { kind: 'combat_gear' }
      }
    }
    if (inventoryFullness >= 0.9) {
      return {
        action: 'manage_inventory',
        priority: Number(Math.max(0.55, inventoryFullness).toFixed(2)),
        reason: `inventory ${inv.usedSlots}/${inv.totalSlots || 36} slots used`,
        target: { usedSlots: inv.usedSlots, totalSlots: inv.totalSlots || 36 }
      }
    }
    if (nearestDrop && nearestDrop.distance <= 6 && danger < 0.35 && inventoryFullness < 0.9) {
      return {
        action: 'collect_item',
        priority: Number(Math.max(0.4, (6 - nearestDrop.distance) / 6).toFixed(2)),
        reason: 'interesting dropped item ' + nearestDrop.name,
        target: nearestDrop
      }
    }
    if (nearestBlock && nearestBlock.distance <= 5 && hunger < 0.35 && danger < 0.35 && inventoryFullness < 0.9) {
      return {
        action: 'dig_block',
        priority: Number(Math.max(0.35, (5 - nearestBlock.distance) / 5).toFixed(2)),
        reason: 'interesting block ' + nearestBlock.name,
        target: nearestBlock
      }
    }
    if (hunger >= 0.45) {
      return {
        action: 'pathfind_to_food',
        priority: Number(hunger.toFixed(2)),
        reason: `food level ${food}/20`,
        target: { food }
      }
    }
    if (danger < 0.35 && inv.logs > 0 && inv.craftingTable <= 0) {
      return {
        action: 'craft_item',
        priority: 0.5,
        reason: 'logs available but no crafting table',
        target: { item: 'crafting_table' }
      }
    }
    if (danger < 0.35 && inv.planks >= 3 && inv.pickaxes <= 0) {
      return {
        action: 'craft_item',
        priority: 0.48,
        reason: 'basic mining needs a pickaxe',
        target: { item: 'wooden_pickaxe' }
      }
    }
    if (danger < 0.35 && inv.cobblestone >= 3 && inv.pickaxes <= 0) {
      return {
        action: 'craft_item',
        priority: 0.5,
        reason: 'stone is available for a pickaxe',
        target: { item: 'stone_pickaxe' }
      }
    }
    if (danger < 0.35 && blocked && inv.buildingBlocks > 0) {
      return {
        action: 'place_block',
        priority: 0.43,
        reason: 'movement is blocked while exploring',
        target: { kind: 'support_block', buildingBlocks: inv.buildingBlocks }
      }
    }
    if (nearest && !nearest.hostile && nearest.distance <= 6) {
      return {
        action: 'observe_entity',
        priority: Number(((6 - nearest.distance) / 6).toFixed(2)),
        reason: `${nearest.name} nearby`,
        target: { name: nearest.name, type: nearest.type, distance: Number(nearest.distance.toFixed(1)), hostile: false }
      }
    }
    if (danger < 0.25 && hunger < 0.25 && explorationDrive >= 0.32) {
      return {
        action: 'explore_area',
        priority: Number(explorationDrive.toFixed(2)),
        reason: 'exploration drive is active',
        target: { wind: Number(Number(wind || 0).toFixed(2)) }
      }
    }
    if (restDrive >= 0.45) {
      return {
        action: 'rest',
        priority: Number(restDrive.toFixed(2)),
        reason: 'safe and stable rest mode',
        target: { health, food }
      }
    }
    return { action: 'idle', priority: 0, reason: 'no strong drive' }
  }

  inventorySummary() {
    const summary = {
      usedSlots: 0,
      totalSlots: 36,
      totalItems: 0,
      logs: 0,
      planks: 0,
      cobblestone: 0,
      craftingTable: 0,
      pickaxes: 0,
      buildingBlocks: 0,
      fullness: 0
    }
    const items = typeof this.bot.inventory?.items === 'function' ? this.bot.inventory.items() : []
    summary.usedSlots = items.length
    summary.totalItems = items.reduce((total, item) => total + Number(item.count || 0), 0)
    for (const item of items) {
      const name = String(item.name || '')
      const count = Number(item.count || 0)
      if (/_log$|_stem$|hyphae$/.test(name)) summary.logs += count
      if (/_planks$/.test(name)) summary.planks += count
      if (name === 'cobblestone') summary.cobblestone += count
      if (name === 'crafting_table') summary.craftingTable += count
      if (/_pickaxe$/.test(name)) summary.pickaxes += count
      if (/dirt|cobblestone|stone|deepslate|netherrack|_planks|_log$|sandstone|gravel/.test(name)) summary.buildingBlocks += count
    }
    summary.fullness = summary.usedSlots / summary.totalSlots
    return summary
  }
  nearestDroppedItem() {
    if (!this.bot.entity) return null
    let best = null
    for (const entity of Object.values(this.bot.entities || {})) {
      if (entity?.name !== 'item' || !entity.position) continue
      const distance = entity.position.distanceTo(this.bot.entity.position)
      if (distance > 10) continue
      const item = entity.metadata?.[8]
      const name = item?.name || item?.displayName || item?.itemName || 'item'
      if (!best || distance < best.distance) best = { name, distance: Number(distance.toFixed(1)), type: 'drop' }
    }
    return best
  }

  nearestInterestingBlock() {
    if (!this.bot.entity || !this.bot.findBlocks || !this.bot.blockAt) return null
    const names = ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log', 'mangrove_log', 'cherry_log', 'stone', 'coal_ore', 'iron_ore', 'deepslate_iron_ore']
    const ids = names.map(name => this.bot.registry?.blocksByName?.[name]?.id).filter(Boolean)
    if (!ids.length) return null
    try {
      const positions = this.bot.findBlocks({ matching: ids, maxDistance: 7, count: 16 })
      return positions.map(position => this.bot.blockAt(position)).filter(Boolean)
        .map(block => ({ name: block.name, type: 'block', distance: Number(block.position.distanceTo(this.bot.entity.position).toFixed(1)) }))
        .sort((left, right) => left.distance - right.distance)[0] || null
    } catch {
      return null
    }
  }
  applyMotor(command) {
    if (!this.enabled || !this.bot.entity) return
    const forward = Number(command.forward || 0)
    const backward = Number(command.backward || 0)
    const stop = Number(command.stop || 0)
    const yaw = Math.max(-1, Math.min(1, Number(command.yaw || 0)))
    const mode = String(command.mode || 'IDLE')

    this.bot.setControlState('forward', stop < 0.35 && forward > 0.06 && mode !== 'HALT' && mode !== 'BRAKE')
    this.bot.setControlState('back', stop < 0.35 && backward > 0.35)
    this.bot.setControlState('sprint', forward > 0.45 && stop < 0.2)
    this.bot.setControlState('jump', Boolean(command.jump) || mode === 'ESCAPE')
    this.bot.setControlState('left', yaw < -0.2)
    this.bot.setControlState('right', yaw > 0.2)
    if (Math.abs(yaw) > 0.04) {
      this.bot.look(this.bot.entity.yaw + yaw * 0.35, this.bot.entity.pitch, true).catch(() => {})
    }
    setTimeout(() => {
      if (this.enabled) this.bot.setControlState('jump', false)
    }, 180)
  }

  stopControls() {
    try { this.bot.clearControlStates() } catch {}
  }

  close() {
    this.enabled = false
    this.stopControls()
    if (this.proc && !this.proc.killed) {
      try { this.proc.kill() } catch {}
    }
    this.proc = null
    this.ready = false
  }
}

function objectLine(object) {
  return [
    object.azimuth.toFixed(1),
    object.elevation.toFixed(1),
    object.size.toFixed(1),
    object.expansion.toFixed(1),
    object.speed.toFixed(1),
    object.flyLike ? 'true' : 'false'
  ].join(',')
}

function wrapRadians(value) {
  while (value > Math.PI) value -= Math.PI * 2
  while (value < -Math.PI) value += Math.PI * 2
  return value
}

module.exports = { FlyBrainDriver }
