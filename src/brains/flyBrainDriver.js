const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const { Vec3 } = require('vec3')

const TICK_MS = 50
const TICK_SECONDS = TICK_MS / 1000
const CONNECTOME_HASH = 'e33df182bed7a6f3ea279daf4790a82b05706d3d41e819a6a80c0473e8c559f3'
const FOOD_ENTITY_RE = /cow|pig|chicken|sheep|rabbit|cod|salmon|tropical_fish|mushroom|mooshroom/i
const FOOD_ITEM_RE = /apple|bread|carrot|potato|beef|porkchop|chicken|mutton|rabbit|cod|salmon|cookie|melon|berries|beetroot|stew|pumpkin_pie|golden_apple/i
const CROP_BLOCK_RE = /wheat|carrots|potatoes|beetroots|melon|pumpkin|berry|cocoa/i
const HOSTILE_RE = /zombie|skeleton|creeper|spider|enderman|witch|slime|guardian|phantom|drowned|pillager|vindicator|evoker|warden|blaze|ghast|hoglin|piglin_brute/i

class FlyBrainDriver {
  constructor({ bot, appRoot, log = console.log }) {
    this.bot = bot
    this.appRoot = appRoot
    this.log = log
    this.enabled = false
    this.ready = false
    this.proc = null
    this.latest = null
    this.lastError = ''
    this.lastTickAt = 0
    this.lastYaw = 0
    this.lastPitch = 0
    this.lastHealth = null
    this.lastCommandAt = 0
    this.lastFrameAt = 0
    this.lastTasteUntil = 0
    this.lastFeedAt = 0
    this.lastGroomAt = 0
    this.lastWatchdogAt = 0
    this.intent = { action: 'idle', priority: 0, reason: 'startup' }
    this.lastInputs = null
    this.building = false
    this.entityMemory = new Map()
    this.strictSensorimotor = process.env.FLYBRAIN_STRICT_SENSORIMOTOR === '1'
    this.telemetry = {
      tickMs: TICK_MS,
      sentFrames: 0,
      receivedFrames: 0,
      missedFrames: 0,
      slowFrames: 0,
      lastWallMs: 0,
      lastRealtimeFactor: null,
      lastLatencyMs: null,
      lastFrameAgeMs: null
    }
  }

  status() {
    this.watchdog()
    return {
      enabled: this.enabled,
      ready: this.ready,
      pid: this.proc?.pid || null,
      latest: this.latest,
      intent: this.intent,
      inputs: this.lastInputs,
      phase: 4,
      tickMs: TICK_MS,
      telemetry: this.telemetry,
      executiveEnabled: !this.strictSensorimotor,
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
    await this.verifyInstall()
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
      flyb,
      '--threads',
      String(process.env.FLYBRAIN_THREADS || '0')
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

  async verifyInstall() {
    const flyb = path.join(this.appRoot, 'external', 'fly-brain-minecraft', 'src', 'main', 'resources', 'connectome', 'malecns-v1.0.flyb.gz')
    const bridgeSource = path.join(this.appRoot, 'src', 'flybrain', 'FlyBrainBridge.java')
    if (!fs.existsSync(flyb)) throw new Error('Flybrain connectome missing. See FLY-BRAIN.md.')
    if (!fs.existsSync(bridgeSource)) throw new Error('Project FlyBrainBridge.java missing at src/flybrain/FlyBrainBridge.java.')
    if (process.env.FLYBRAIN_SKIP_HASH !== '1') {
      const crypto = require('crypto')
      const hash = crypto.createHash('sha256').update(fs.readFileSync(flyb)).digest('hex')
      if (hash !== CONNECTOME_HASH) throw new Error('Flybrain connectome SHA-256 does not match FLY-BRAIN.md.')
    }
  }

  async ensureBuilt() {
    const sourceRoot = path.join(this.appRoot, 'external', 'fly-brain-minecraft', 'src', 'main', 'java')
    const buildRoot = path.join(this.appRoot, 'external', 'fly-brain-build')
    const bridgeClass = path.join(buildRoot, 'com', 'fruitfly', 'brain', 'tools', 'FlyBrainBridge.class')
    const bridgeSource = path.join(this.appRoot, 'src', 'flybrain', 'FlyBrainBridge.java')
    if (fs.existsSync(bridgeClass) && fs.statSync(bridgeClass).mtimeMs >= fs.statSync(bridgeSource).mtimeMs) return
    if (this.building) return
    this.building = true
    fs.mkdirSync(buildRoot, { recursive: true })
    const brainRoot = path.join(sourceRoot, 'com', 'fruitfly', 'brain')
    const sources = [
      ...fs.readdirSync(brainRoot)
        .filter(name => name.endsWith('.java'))
        .map(name => path.join(brainRoot, name)),
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
        this.telemetry.retinaColumns = data.retinaColumns
        this.telemetry.bridgeTickMs = data.tickMs
        return
      }
      if (data.error) {
        this.lastError = data.error
        return
      }
      this.latest = data
      this.lastCommandAt = Date.now()
      this.telemetry.receivedFrames++
      this.telemetry.lastWallMs = Number(data.wallMs || 0)
      this.telemetry.lastRealtimeFactor = Number(data.realtimeFactor || 0)
      this.telemetry.lastLatencyMs = this.lastFrameAt ? Date.now() - this.lastFrameAt : null
      this.telemetry.lastFrameAgeMs = 0
      if (this.telemetry.lastRealtimeFactor && this.telemetry.lastRealtimeFactor < 1) this.telemetry.slowFrames++
      this.applyMotor(data)
    } catch (err) {
      this.lastError = `bad bridge output: ${line.slice(0, 120)}`
    }
  }

  async tick() {
    if (!this.enabled || !this.bot.entity) return false
    await this.ensureStarted()
    this.watchdog()
    if (!this.proc?.stdin || !this.ready) return true
    const now = Date.now()
    if (now - this.lastTickAt < TICK_MS) return true
    const dtSeconds = this.lastTickAt ? Math.max(0.02, Math.min(0.25, (now - this.lastTickAt) / 1000)) : TICK_SECONDS
    this.lastTickAt = now
    this.lastFrameAt = now
    const frame = this.encodeFrame(dtSeconds)
    try {
      this.telemetry.sentFrames++
      this.proc.stdin.write(`${frame}\n`)
    } catch (err) {
      this.lastError = err.message
      this.stopControls()
    }
    return true
  }

  watchdog() {
    const now = Date.now()
    if (!this.enabled || now - this.lastWatchdogAt < 250) return
    this.lastWatchdogAt = now
    if (this.lastCommandAt) this.telemetry.lastFrameAgeMs = now - this.lastCommandAt
    if (this.ready && this.lastCommandAt && now - this.lastCommandAt > 1500) {
      this.telemetry.missedFrames++
      this.lastError = `fly brain watchdog: no motor frame for ${now - this.lastCommandAt}ms`
      this.stopControls()
    }
  }

  encodeFrame(dtSeconds = TICK_SECONDS) {
    const yaw = this.bot.entity?.yaw || 0
    const pitch = this.bot.entity?.pitch || 0
    const yawRate = (wrapRadians(yaw - this.lastYaw) * 180 / Math.PI) / dtSeconds
    const pitchRate = ((pitch - this.lastPitch) * 180 / Math.PI) / dtSeconds
    this.lastYaw = yaw
    this.lastPitch = pitch

    const health = Number(this.bot.health || 20)
    const damage = this.lastHealth === null ? 0 : Math.max(0, Math.min(1, (this.lastHealth - health) / 8))
    this.lastHealth = health

    const food = Number(this.bot.food || 20)
    const ambient = this.ambientLight()
    const retina = this.retinaSamples(ambient)
    const visualObjects = this.visibleObjects()
    const nearest = visualObjects.find(object => object.kind !== 'drop') || null
    const nearestDrop = this.nearestDroppedItem()
    const nearestBlock = this.nearestInterestingBlock()
    const wind = this.windSignals()
    const touch = this.touchSignals(damage)
    const odorSource = this.odorSource()
    const taste = this.tasteSignal()
    const airborne = this.bot.entity?.onGround === false
    const blocked = Boolean(this.latest && Number(this.latest.forward || 0) > 0.1 && wind.speed < 0.03 && !airborne && touch.head > 0.2)
    const inventory = this.inventorySummary()
    const objects = visualObjects.slice(0, 8).map(objectLine).join('|')
    this.lastInputs = {
      health,
      food,
      ambient,
      damage,
      wind: Number(wind.speed.toFixed(2)),
      windLeft: Number(wind.left.toFixed(2)),
      windRight: Number(wind.right.toFixed(2)),
      airborne,
      legsOnGround: !airborne,
      blocked,
      touch,
      odor: odorSource,
      taste,
      visualObjectCount: visualObjects.length,
      retinaSamples: retina.length,
      inventoryUsedSlots: inventory.usedSlots,
      inventoryFullness: Number(inventory.fullness.toFixed(2)),
      hasCraftingTable: inventory.craftingTable > 0,
      hasLogs: inventory.logs > 0,
      hasPickaxe: inventory.pickaxes > 0,
      buildBlocks: inventory.buildingBlocks,
      nearest: nearest ? publicObject(nearest) : null,
      nearestDrop,
      nearestBlock
    }
    this.intent = this.computeMinecraftExecutiveIntent({ health, food, damage, nearest, nearestDrop, nearestBlock, inventory, wind: wind.speed, airborne, blocked })
    return [
      `ambient=${ambient.toFixed(2)}`,
      `retina=${retina.map(value => value.toFixed(2)).join(',')}`,
      `damage=${damage.toFixed(2)}`,
      `windLeft=${wind.left.toFixed(2)}`,
      `windRight=${wind.right.toFixed(2)}`,
      `airborne=${airborne}`,
      `legsOnGround=${!airborne}`,
      `wingbeat=${Math.max(0, Number(this.latest?.flightPower || 0)).toFixed(2)}`,
      `tilt=${touch.tilt.toFixed(2)}`,
      `soundLow=${touch.soundLow.toFixed(2)}`,
      `soundHigh=${touch.soundHigh.toFixed(2)}`,
      `song=0`,
      `yawRate=${yawRate.toFixed(2)}`,
      `pitchRate=${pitchRate.toFixed(2)}`,
      `rollRate=0`,
      `touchHead=${touch.head.toFixed(2)}`,
      `touchWing=${touch.wing.toFixed(2)}`,
      `touchLegs=${touch.legs.toFixed(2)}`,
      `touchNotum=${touch.notum.toFixed(2)}`,
      `touchAbdomen=${touch.abdomen.toFixed(2)}`,
      `groomDust=${touch.groomDust.toFixed(2)}`,
      `odor=${odorSource.encoded}`,
      `odorBearing=${Number.isFinite(odorSource.bearing) ? odorSource.bearing.toFixed(1) : ''}`,
      `taste=${taste.encoded}`,
      `objects=${objects}`
    ].join(';')
  }

  ambientLight() {
    const time = Number(this.bot.time?.timeOfDay || 6000)
    const dayDistance = Math.min(Math.abs(time - 6000), Math.abs(time - 30000))
    return Math.max(0.08, Math.min(0.9, 0.9 - (dayDistance / 12000) * 0.75))
  }

  retinaSamples(ambient) {
    if (!this.bot.entity || !this.bot.world?.raycast) return Array(45).fill(ambient)
    const samples = []
    const yawBase = this.bot.entity.yaw || 0
    const pitchBase = this.bot.entity.pitch || 0
    const eye = this.bot.entity.position.offset(0, 1.45, 0)
    const azimuths = [-80, -60, -40, -20, 0, 20, 40, 60, 80]
    const elevations = [-35, -18, 0, 18, 35]
    for (const elevation of elevations) {
      for (const azimuth of azimuths) {
        const direction = directionFromYawPitch(yawBase + degToRad(azimuth), pitchBase + degToRad(elevation))
        const hit = this.bot.world.raycast(eye, direction, 24)
        if (!hit) {
          samples.push(Math.min(1, ambient + 0.12))
          continue
        }
        const light = Number(hit.skyLight ?? hit.light ?? 8) / 15
        const distanceShade = Math.max(0.15, 1 - (hit.position.distanceTo(eye) / 30))
        const solidShade = hit.boundingBox === 'block' ? 0.62 : 0.85
        samples.push(Math.max(0.04, Math.min(1, light * 0.75 + ambient * 0.25 * distanceShade * solidShade)))
      }
    }
    return samples
  }

  visibleObjects() {
    if (!this.bot.entity) return []
    const objects = []
    for (const entity of Object.values(this.bot.entities || {})) {
      if (!entity?.position || entity === this.bot.entity) continue
      const distance = entity.position.distanceTo(this.bot.entity.position)
      if (distance > 18 || distance < 0.1) continue
      if (!this.hasLineOfSight(entity.position.offset(0, entity.height ? entity.height / 2 : 0.8, 0), distance)) continue
      const kind = entity.type === 'player' ? 'player' : entity.name || entity.mobType || ''
      const hostile = HOSTILE_RE.test(kind)
      const delta = entity.position.minus(this.bot.entity.position)
      const targetYaw = Math.atan2(-delta.x, -delta.z)
      const yawDiff = wrapRadians(targetYaw - this.bot.entity.yaw)
      const horizontal = Math.max(0.1, Math.sqrt(delta.x * delta.x + delta.z * delta.z))
      const elevation = Math.atan2(delta.y, horizontal) * 180 / Math.PI
      const id = String(entity.id ?? entity.uuid ?? entity.username ?? entity.name)
      const angularSize = Math.max(3, Math.min(70, 55 / distance))
      const previous = this.entityMemory.get(id)
      const now = Date.now()
      const dt = previous ? Math.max(0.05, (now - previous.at) / 1000) : TICK_SECONDS
      const expansion = previous ? Math.max(-120, Math.min(120, (angularSize - previous.angularSize) / dt)) : 0
      const angularSpeed = previous ? Math.max(0, Math.min(180, Math.abs((yawDiff * 180 / Math.PI) - previous.azimuth) / dt)) : 0
      this.entityMemory.set(id, { at: now, angularSize, azimuth: yawDiff * 180 / Math.PI })
      objects.push({
        kind,
        name: entity.username || entity.name || 'entity',
        type: entity.type || entity.name || 'entity',
        distance,
        hostile,
        azimuth: Math.max(-120, Math.min(120, yawDiff * 180 / Math.PI)),
        elevation: Math.max(-60, Math.min(60, elevation)),
        size: angularSize,
        expansion,
        speed: angularSpeed,
        contrast: hostile ? 1 : 0.65,
        flyLike: false
      })
    }
    const now = Date.now()
    for (const [id, seen] of this.entityMemory.entries()) if (now - seen.at > 5000) this.entityMemory.delete(id)
    return objects.sort((left, right) => (right.hostile ? 100 : 0) + (18 - right.distance) - ((left.hostile ? 100 : 0) + (18 - left.distance)))
  }

  hasLineOfSight(target, distance) {
    if (!this.bot.entity || !this.bot.world?.raycast) return true
    const eye = this.bot.entity.position.offset(0, 1.45, 0)
    const delta = target.minus(eye)
    const hit = this.bot.world.raycast(eye, delta.normalize(), Math.min(distance, delta.norm()))
    return !hit || hit.position.distanceTo(eye) + 0.75 >= delta.norm()
  }

  odorSource() {
    if (!this.bot.entity) return { encoded: '', bearing: NaN, source: null }
    let best = null
    const consider = (position, name, type, strength) => {
      const distance = position.distanceTo(this.bot.entity.position)
      if (distance > 16) return
      const drive = Math.max(0, Math.min(1, strength / Math.max(1, distance)))
      if (drive <= 0.03) return
      if (!best || drive > best.drive) {
        const delta = position.minus(this.bot.entity.position)
        const targetYaw = Math.atan2(-delta.x, -delta.z)
        best = { name, type, drive, bearing: wrapRadians(targetYaw - this.bot.entity.yaw) * 180 / Math.PI, distance }
      }
    }
    for (const entity of Object.values(this.bot.entities || {})) {
      if (!entity?.position || entity === this.bot.entity) continue
      if (FOOD_ENTITY_RE.test(entity.name || entity.mobType || '')) consider(entity.position, entity.name || 'food_entity', 'food_entity', 1.6)
      if (entity.name === 'item') {
        const item = entity.metadata?.[8]
        const name = item?.name || item?.displayName || item?.itemName || 'item'
        if (FOOD_ITEM_RE.test(name)) consider(entity.position, name, 'food_drop', 2.2)
      }
    }
    const crop = this.nearestBlockMatching(CROP_BLOCK_RE, 10)
    if (crop) consider(crop.position, crop.name, 'food_block', 1.2)
    if (!best) return { encoded: '', bearing: NaN, source: null }
    return {
      encoded: `DM1:${best.drive.toFixed(2)},DM2:${(best.drive * 0.6).toFixed(2)},VA2:${(best.drive * 0.35).toFixed(2)}`,
      bearing: best.bearing,
      source: { name: best.name, type: best.type, distance: Number(best.distance.toFixed(1)), drive: Number(best.drive.toFixed(2)) }
    }
  }

  tasteSignal() {
    if (Date.now() > this.lastTasteUntil) return { encoded: '', active: false }
    return { encoded: 'LB3b:0.8,LB3c:0.8,PhG1a:0.6,LgLG3:0.25', active: true }
  }

  recordTaste(durationMs = 1200) {
    this.lastTasteUntil = Date.now() + durationMs
  }

  windSignals() {
    const velocity = this.bot.entity?.velocity || { x: 0, z: 0 }
    const speed = Math.min(1, Math.max(0, Math.abs(velocity.x || 0) + Math.abs(velocity.z || 0)))
    const yaw = this.bot.entity?.yaw || 0
    const forwardX = -Math.sin(yaw)
    const forwardZ = -Math.cos(yaw)
    const sideX = Math.cos(yaw)
    const sideZ = -Math.sin(yaw)
    const forwardFlow = (velocity.x || 0) * forwardX + (velocity.z || 0) * forwardZ
    const sideFlow = (velocity.x || 0) * sideX + (velocity.z || 0) * sideZ
    return {
      speed,
      left: Math.max(0, Math.min(1, speed + Math.max(0, -sideFlow) * 0.8 + Math.max(0, forwardFlow) * 0.2)),
      right: Math.max(0, Math.min(1, speed + Math.max(0, sideFlow) * 0.8 + Math.max(0, forwardFlow) * 0.2))
    }
  }

  touchSignals(damage) {
    const entity = this.bot.entity
    if (!entity || !this.bot.blockAt) return { head: damage > 0 ? 0.5 : 0, wing: 0, legs: 0, notum: 0, abdomen: 0, groomDust: 0, tilt: 0, soundLow: 0, soundHigh: 0 }
    const pos = entity.position.floored()
    const yaw = entity.yaw || 0
    const forward = new Vec3(Math.round(-Math.sin(yaw)), 0, Math.round(-Math.cos(yaw)))
    const front = this.bot.blockAt(pos.plus(forward))
    const head = this.bot.blockAt(pos.plus(forward).offset(0, 1, 0))
    const feet = this.bot.blockAt(pos.offset(0, -1, 0))
    const current = this.bot.blockAt(pos)
    const inWater = Boolean(entity.isInWater || current?.name?.includes('water'))
    const inCobweb = Boolean(current?.name?.includes('cobweb'))
    return {
      head: Math.max(damage > 0 ? 0.5 : 0, head?.boundingBox === 'block' ? 0.8 : 0, front?.boundingBox === 'block' ? 0.45 : 0),
      wing: inWater ? 0.5 : 0,
      legs: feet?.boundingBox === 'block' ? 0.35 : 0,
      notum: inCobweb ? 0.8 : 0,
      abdomen: damage > 0 ? 0.35 : 0,
      groomDust: inCobweb ? 0.9 : inWater ? 0.3 : 0,
      tilt: entity.onGround === false ? 0.35 : 0,
      soundLow: damage > 0 ? 0.6 : 0,
      soundHigh: HOSTILE_RE.test(this.visibleObjects()[0]?.kind || '') ? 0.35 : 0
    }
  }


  recordSound(name = '', volume = 1) {
    const text = String(name || '').toLowerCase()
    const strength = Math.max(0.15, Math.min(1, Number(volume || 1)))
    const now = Date.now()
    if (/explode|thunder|dragon|wither|tnt|creeper|arrow|trident|attack|hurt|death/.test(text)) this.soundHighUntil = Math.max(this.soundHighUntil, now + Math.round(700 * strength))
    else if (/step|walk|swim|splash|block|place|break|ambient|mob|entity/.test(text)) this.soundLowUntil = Math.max(this.soundLowUntil, now + Math.round(500 * strength))
    if (/note|music|song|jukebox/.test(text)) this.songUntil = Math.max(this.songUntil, now + Math.round(1000 * strength))
  }

  soundLowSignal() {
    return Date.now() < this.soundLowUntil ? 0.55 : 0
  }

  soundHighSignal() {
    return Date.now() < this.soundHighUntil ? 0.75 : 0
  }

  songSignal() {
    return Date.now() < this.songUntil ? 0.65 : 0
  }

  computeMinecraftExecutiveIntent({ health, food, damage, nearest, nearestDrop, nearestBlock, inventory, wind, airborne, blocked }) {
    if (this.strictSensorimotor) return { action: 'idle', priority: 0, reason: 'strict sensorimotor mode: MinecraftExecutive disabled' }
    const hunger = Math.max(0, Math.min(1, (14 - Number(food || 20)) / 10))
    const lowHealth = Math.max(0, Math.min(1, (14 - Number(health || 20)) / 10))
    const proximityDanger = nearest?.hostile ? Math.max(0, Math.min(1, (16 - Number(nearest.distance || 16)) / 16)) : 0
    const danger = Math.max(Number(damage || 0), lowHealth, proximityDanger)
    const inv = inventory || this.inventorySummary()
    const inventoryFullness = Number(inv.fullness || 0)
    const explorationDrive = Math.max(0, Math.min(1, 0.15 + (Number(wind || 0) < 0.04 ? 0.25 : 0) + (nearestBlock ? 0.1 : 0) + (nearestDrop ? 0.1 : 0) - danger * 0.5 - hunger * 0.4))
    const restDrive = Math.max(0, Math.min(1, (health >= 19 ? 0.25 : 0) + (food >= 18 ? 0.25 : 0) - (nearest ? 0.12 : 0) - danger))

    if (danger >= 0.78 && nearest?.hostile && nearest.distance <= 4.5 && health >= 10) return { action: 'attack_entity', priority: Number(danger.toFixed(2)), reason: 'attack reflex against ' + nearest.name, target: publicObject(nearest) }
    if (danger >= 0.55 && (nearest?.hostile || damage > 0)) return { action: 'retreat_from_entity', priority: Number(danger.toFixed(2)), reason: nearest?.hostile ? `hostile ${nearest.name} nearby` : (damage > 0 ? 'damage spike' : 'low health'), target: nearest ? publicObject(nearest) : null }
    if (health <= 14 && (!nearest?.hostile || damage > 0)) return { action: 'equip_item', priority: Number(Math.max(0.5, lowHealth).toFixed(2)), reason: 'danger calls for armor and weapon', target: { kind: 'combat_gear' } }
    if (inventoryFullness >= 0.9) return { action: 'manage_inventory', priority: Number(Math.max(0.55, inventoryFullness).toFixed(2)), reason: `inventory ${inv.usedSlots}/${inv.totalSlots || 36} slots used`, target: { usedSlots: inv.usedSlots, totalSlots: inv.totalSlots || 36 } }
    if (nearestDrop && nearestDrop.distance <= 6 && danger < 0.35 && inventoryFullness < 0.9) return { action: 'collect_item', priority: Number(Math.max(0.4, (6 - nearestDrop.distance) / 6).toFixed(2)), reason: 'interesting dropped item ' + nearestDrop.name, target: nearestDrop }
    if (nearestBlock && nearestBlock.distance <= 5 && hunger < 0.35 && danger < 0.35 && inventoryFullness < 0.9) return { action: 'dig_block', priority: Number(Math.max(0.35, (5 - nearestBlock.distance) / 5).toFixed(2)), reason: 'interesting block ' + nearestBlock.name, target: nearestBlock }
    if (hunger >= 0.45) return { action: 'pathfind_to_food', priority: Number(hunger.toFixed(2)), reason: `food level ${food}/20`, target: { food } }
    if (danger < 0.35 && inv.logs > 0 && inv.craftingTable <= 0) return { action: 'craft_item', priority: 0.5, reason: 'logs available but no crafting table', target: { item: 'crafting_table' } }
    if (danger < 0.35 && inv.planks >= 3 && inv.pickaxes <= 0) return { action: 'craft_item', priority: 0.48, reason: 'basic mining needs a pickaxe', target: { item: 'wooden_pickaxe' } }
    if (danger < 0.35 && inv.cobblestone >= 3 && inv.pickaxes <= 0) return { action: 'craft_item', priority: 0.5, reason: 'stone is available for a pickaxe', target: { item: 'stone_pickaxe' } }
    if (danger < 0.35 && blocked && inv.buildingBlocks > 0) return { action: 'place_block', priority: 0.43, reason: 'movement is blocked while exploring', target: { kind: 'support_block', buildingBlocks: inv.buildingBlocks } }
    if (nearest && !nearest.hostile && nearest.distance <= 6) return { action: 'observe_entity', priority: Number(((6 - nearest.distance) / 6).toFixed(2)), reason: `${nearest.name} nearby`, target: publicObject(nearest) }
    if (danger < 0.25 && hunger < 0.25 && explorationDrive >= 0.32) return { action: 'explore_area', priority: Number(explorationDrive.toFixed(2)), reason: 'exploration drive is active', target: { wind: Number(Number(wind || 0).toFixed(2)) } }
    if (restDrive >= 0.45) return { action: 'rest', priority: Number(restDrive.toFixed(2)), reason: 'safe and stable rest mode', target: { health, food } }
    return { action: 'idle', priority: 0, reason: 'no strong drive' }
  }


  computeIntent(input) {
    return this.computeMinecraftExecutiveIntent(input)
  }  nearestDroppedItem() {
    if (!this.bot.entity) return null
    let best = null
    for (const entity of Object.values(this.bot.entities || {})) {
      if (entity?.name !== 'item' || !entity.position) continue
      const distance = entity.position.distanceTo(this.bot.entity.position)
      if (distance > 10 || !this.hasLineOfSight(entity.position, distance)) continue
      const item = entity.metadata?.[8]
      const name = item?.name || item?.displayName || item?.itemName || 'item'
      if (!best || distance < best.distance) best = { name, distance: Number(distance.toFixed(1)), type: 'drop' }
    }
    return best
  }

  nearestInterestingBlock() {
    const block = this.nearestBlockMatching(/_log$|stone|coal_ore|iron_ore|deepslate_iron_ore/, 7)
    return block ? { name: block.name, type: 'block', distance: Number(block.position.distanceTo(this.bot.entity.position).toFixed(1)) } : null
  }

  nearestBlockMatching(regex, maxDistance) {
    if (!this.bot.entity || !this.bot.findBlocks || !this.bot.blockAt) return null
    const blocks = this.bot.registry?.blocksByName || {}
    const ids = Object.entries(blocks).filter(([name]) => regex.test(name)).map(([, value]) => value.id).filter(Boolean)
    if (!ids.length) return null
    try {
      const positions = this.bot.findBlocks({ matching: ids, maxDistance, count: 24 })
      return positions.map(position => this.bot.blockAt(position)).filter(Boolean)
        .filter(block => this.bot.canSeeBlock ? this.bot.canSeeBlock(block) : true)
        .sort((left, right) => left.position.distanceTo(this.bot.entity.position) - right.position.distanceTo(this.bot.entity.position))[0] || null
    } catch {
      return null
    }
  }

  inventorySummary() {
    const summary = { usedSlots: 0, totalSlots: 36, totalItems: 0, logs: 0, planks: 0, cobblestone: 0, craftingTable: 0, pickaxes: 0, buildingBlocks: 0, fullness: 0 }
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

  applyMotor(command) {
    if (!this.enabled || !this.bot.entity) return
    const forward = Number(command.forward || 0)
    const backward = Number(command.backward || 0)
    const stop = Number(command.stop || 0)
    const yaw = Math.max(-1, Math.min(1, Number(command.yaw || 0) + Number(command.flightYaw || 0) * 0.5))
    const mode = String(command.mode || 'IDLE')
    const flightPower = Number(command.flightPower || 0)
    const landing = Number(command.landing || 0)
    const feed = Number(command.feed || 0)
    const groom = Number(command.groom || 0)

    const wantsStop = stop >= 0.35 || mode === 'HALT' || mode === 'BRAKE' || landing > 0.35
    this.bot.setControlState('forward', !wantsStop && forward > 0.06 && mode !== 'FEED' && mode !== 'GROOM')
    this.bot.setControlState('back', !wantsStop && backward > 0.35)
    this.bot.setControlState('sprint', (mode === 'ESCAPE' || flightPower > 0.35 || forward > 0.45) && !wantsStop)
    this.bot.setControlState('jump', Boolean(command.jump) || mode === 'ESCAPE' || (flightPower > 0.5 && landing < 0.3))
    this.bot.setControlState('left', yaw < -0.2)
    this.bot.setControlState('right', yaw > 0.2)
    if (Math.abs(yaw) > 0.04) this.bot.look(this.bot.entity.yaw + yaw * 0.35, this.bot.entity.pitch, true).catch(() => {})
    if (feed > 0.2 || mode === 'FEED') this.tryFeed().catch(err => { this.lastError = `feed failed: ${err.message}` })
    if (groom > 0.35 || mode === 'GROOM') this.tryGroom()
    setTimeout(() => {
      if (this.enabled) this.bot.setControlState('jump', false)
    }, 180)
  }

  async tryFeed() {
    const now = Date.now()
    if (now - this.lastFeedAt < 2500 || !this.bot.inventory?.items) return false
    this.lastFeedAt = now
    const food = this.bot.inventory.items().find(item => FOOD_ITEM_RE.test(item.name || ''))
    if (!food) return false
    await this.bot.equip(food, 'hand')
    await this.bot.consume()
    this.recordTaste()
    return true
  }

  tryGroom() {
    const now = Date.now()
    if (now - this.lastGroomAt < 1200) return
    this.lastGroomAt = now
    try { this.bot.swingArm('right') } catch {}
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
    object.flyLike ? 'true' : 'false',
    Number(object.contrast || 1).toFixed(2)
  ].join(',')
}

function publicObject(object) {
  return {
    name: object.name,
    type: object.type,
    distance: Number(object.distance.toFixed(1)),
    hostile: Boolean(object.hostile),
    azimuth: Number(object.azimuth.toFixed(1)),
    expansion: Number(object.expansion.toFixed(1)),
    speed: Number(object.speed.toFixed(1))
  }
}

function directionFromYawPitch(yaw, pitch) {
  const x = -Math.sin(yaw) * Math.cos(pitch)
  const y = -Math.sin(pitch)
  const z = -Math.cos(yaw) * Math.cos(pitch)
  return new Vec3(x, y, z).normalize()
}

function degToRad(value) {
  return value * Math.PI / 180
}

function wrapRadians(value) {
  while (value > Math.PI) value -= Math.PI * 2
  while (value < -Math.PI) value += Math.PI * 2
  return value
}

module.exports = { FlyBrainDriver }
