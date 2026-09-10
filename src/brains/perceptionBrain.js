const { KnowledgeService } = require('../services/knowledgeService')

const HOSTILE_MOBS = new Set([
  'zombie', 'zombie_villager', 'husk', 'drowned', 'skeleton', 'stray', 'bogged',
  'spider', 'cave_spider', 'creeper', 'witch', 'slime', 'magma_cube', 'phantom',
  'pillager', 'vindicator', 'evoker', 'ravager', 'vex', 'warden', 'enderman',
  'silverfish', 'endermite', 'blaze', 'ghast', 'wither_skeleton', 'zoglin',
  'hoglin', 'piglin_brute', 'shulker'
])

const ORE_BLOCKS = [
  'coal_ore', 'deepslate_coal_ore',
  'copper_ore', 'deepslate_copper_ore',
  'iron_ore', 'deepslate_iron_ore',
  'gold_ore', 'deepslate_gold_ore', 'nether_gold_ore',
  'redstone_ore', 'deepslate_redstone_ore',
  'lapis_ore', 'deepslate_lapis_ore',
  'diamond_ore', 'deepslate_diamond_ore',
  'emerald_ore', 'deepslate_emerald_ore',
  'ancient_debris', 'nether_quartz_ore'
]

const STATION_BLOCKS = [
  'crafting_table', 'furnace', 'blast_furnace', 'smoker', 'chest', 'barrel',
  'anvil', 'chipped_anvil', 'damaged_anvil', 'enchanting_table', 'brewing_stand',
  'grindstone', 'smithing_table'
]

const DANGER_BLOCKS = ['lava', 'fire', 'soul_fire', 'cactus', 'magma_block', 'campfire', 'soul_campfire']
const WATER_BLOCKS = ['water', 'bubble_column', 'kelp', 'seagrass', 'tall_seagrass']

class PerceptionBrain {
  constructor(options = {}) {
    this.bot = options.bot
    this.state = options.state || {}
    this.knowledge = options.knowledge || {}
    this.mcDataProvider = options.mcData || null
    this.knowledgeService = options.knowledgeService || new KnowledgeService(this.knowledge)
    this.playerPvpEnabledProvider = options.playerPvpEnabled || null
    this.cache = {}
    this.nearbyBlockCacheMs = Number(options.nearbyBlockCacheMs || 2500)
    this.blockMapCacheMs = Number(options.blockMapCacheMs || 7000)
  }

  perceive() {
    const bot = this.bot
    const entity = bot?.entity
    const position = entity?.position
    const inventoryItems = this.inventoryItems()
    const armorItems = this.armorItems()
    const allGear = [...inventoryItems, ...armorItems]
    const toolAvailability = this.knowledgeService.toolAvailability(allGear)
    const armorInInventory = inventoryItems.filter(item => /_(helmet|chestplate|leggings|boots)$/.test(item.name))
    const nearbyHostiles = this.nearbyHostiles()
    const nearbyPlayers = this.nearbyPlayers()
    const nearbyItems = this.nearbyItems()
    const nearbyOres = this.nearbyBlocks(ORE_BLOCKS, 24, 32)
    const nearbyCraftingStations = this.nearbyBlocks(STATION_BLOCKS, 18, 24)
    const nearbyDangers = this.nearbyBlocks(DANGER_BLOCKS, 8, 16)
    const nearbyWater = this.nearbyBlocks(WATER_BLOCKS, 8, 12)
    const environment = this.environmentSummary(nearbyDangers, nearbyWater)

    const situation = {
      health: Number(bot?.health || 0),
      food: Number(bot?.food || 0),
      position: position ? {
        x: Number(position.x),
        y: Number(position.y),
        z: Number(position.z)
      } : null,
      dimension: this.dimension(),
      timeOfDay: bot?.time?.timeOfDay ?? bot?.time?.dayTime ?? null,
      inventoryItems,
      armorItems,
      armorInInventory,
      armorScore: this.knowledgeService.armorScore(allGear),
      weaponScore: this.knowledgeService.weaponScore(allGear),
      durability: this.durabilitySummary(allGear),
      toolAvailability,
      hasFood: this.knowledgeService.hasFood(inventoryItems),
      bestFood: this.knowledgeService.bestFood(inventoryItems),
      hasShield: Boolean(toolAvailability.shield),
      hasPickaxe: Boolean(toolAvailability.pickaxe),
      nearbyHostiles,
      nearbyPlayers,
      nearbyItems,
      nearbyOres,
      nearbyCraftingStations,
      nearbyDangers,
      nearbyWater,
      blockMap: this.blockMap(3),
      environment,
      routeBlocked: this.routeBlocked(),
      dangerLevel: 0,
      currentMode: this.state.mode || 'unknown',
      currentTask: this.state.currentTask || this.state.planner || null,
      playerPvpEnabled: this.playerPvpEnabled()
    }

    situation.dangerLevel = this.dangerLevel(situation)
    situation.readyForDiamonds = this.readyForDiamonds(situation)
    situation.netherPreparationReady = this.netherPreparationReady(situation)
    return situation
  }

  inventoryItems() {
    try {
      return this.bot.inventory.items().map(item => ({
        name: item.name,
        count: item.count,
        slot: item.slot,
        durabilityUsed: item.durabilityUsed ?? null,
        maxDurability: item.maxDurability ?? null
      }))
    } catch {
      return []
    }
  }

  armorItems() {
    try {
      return this.bot.inventory.slots
        .slice(5, 9)
        .filter(Boolean)
        .map(item => ({
          name: item.name,
          count: item.count,
          slot: item.slot,
          durabilityUsed: item.durabilityUsed ?? null,
          maxDurability: item.maxDurability ?? null
        }))
    } catch {
      return []
    }
  }

  dimension() {
    const game = this.bot?.game || {}
    return game.dimension || game.dimensionName || game.levelType || 'unknown'
  }

  nearbyHostiles(range = 24) {
    const bot = this.bot
    const base = bot?.entity?.position
    if (!base) return []
    return Object.values(bot.entities || {})
      .filter(entity => entity && entity.type === 'mob' && HOSTILE_MOBS.has(entity.name))
      .map(entity => this.entitySummary(entity, base))
      .filter(entity => entity.distance <= range)
      .sort((a, b) => a.distance - b.distance)
  }

  nearbyPlayers(range = 32) {
    const bot = this.bot
    const base = bot?.entity?.position
    if (!base) return []
    return Object.values(bot.players || {})
      .map(player => player?.entity)
      .filter(entity => entity && entity.username !== bot.username)
      .map(entity => this.entitySummary(entity, base))
      .filter(entity => entity.distance <= range)
      .sort((a, b) => a.distance - b.distance)
  }

  nearbyItems(range = 16) {
    const bot = this.bot
    const base = bot?.entity?.position
    if (!base) return []
    return Object.values(bot.entities || {})
      .filter(entity => entity?.name === 'item')
      .map(entity => this.entitySummary(entity, base))
      .filter(entity => entity.distance <= range)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 24)
  }

  nearbyBlocks(names, maxDistance, count) {
    const mcData = this.mcData()
    const bot = this.bot
    if (!mcData || !bot?.findBlocks || !bot.entity) return []
    const key = `nearby:${names.join(',')}:${maxDistance}:${count}`
    const cached = this.cache[key]
    if (cached && Date.now() - cached.at < this.nearbyBlockCacheMs) return cached.value
    const ids = names
      .map(name => mcData.blocksByName?.[name]?.id)
      .filter(id => typeof id === 'number')
    if (!ids.length) return []
    try {
      const value = bot.findBlocks({ matching: ids, maxDistance, count })
        .map(position => {
          const block = bot.blockAt(position)
          return {
            name: block?.name || 'unknown',
            position: { x: position.x, y: position.y, z: position.z },
            distance: position.distanceTo(bot.entity.position)
          }
        })
        .sort((a, b) => a.distance - b.distance)
      this.cache[key] = { at: Date.now(), value }
      return value
    } catch {
      return []
    }
  }

  blockMap(radius = 4) {
    const bot = this.bot
    const base = bot?.entity?.position?.floored?.()
    if (!base || !bot.blockAt) return []
    const key = `blockMap:${radius}:${base.x >> 1}:${base.y >> 1}:${base.z >> 1}`
    const cached = this.cache[key]
    if (cached && Date.now() - cached.at < this.blockMapCacheMs) return cached.value
    const blocks = []
    for (let x = -radius; x <= radius; x++) {
      for (let y = -1; y <= 2; y++) {
        for (let z = -radius; z <= radius; z++) {
          const position = base.offset(x, y, z)
          const block = bot.blockAt(position)
          if (!block) continue
          if (block.boundingBox === 'empty' && y !== -1) continue
          blocks.push({
            name: block.name,
            position: { x: position.x, y: position.y, z: position.z },
            solid: block.boundingBox === 'block',
            distance: position.distanceTo(bot.entity.position)
          })
        }
      }
    }
    this.cache[key] = { at: Date.now(), value: blocks }
    return blocks
  }

  durabilitySummary(items = []) {
    const summary = {
      low: [],
      critical: [],
      bestPickaxeDurability: null,
      bestWeaponDurability: null
    }
    for (const item of items || []) {
      const max = Number(item.maxDurability || 0)
      if (!max) continue
      const remaining = Math.max(0, max - Number(item.durabilityUsed || 0))
      const ratio = remaining / max
      const entry = { name: item.name, remaining, max, ratio }
      if (ratio <= 0.08) summary.critical.push(entry)
      else if (ratio <= 0.2) summary.low.push(entry)
      if (/_pickaxe$/.test(item.name) && (!summary.bestPickaxeDurability || ratio > summary.bestPickaxeDurability.ratio)) summary.bestPickaxeDurability = entry
      if (/_(sword|axe)$/.test(item.name) && (!summary.bestWeaponDurability || ratio > summary.bestWeaponDurability.ratio)) summary.bestWeaponDurability = entry
    }
    return summary
  }

  environmentSummary(nearbyDangers = [], nearbyWater = []) {
    const bot = this.bot
    const base = bot?.entity?.position?.floored?.()
    const result = {
      lavaNearby: nearbyDangers.some(block => block.name === 'lava' && block.distance <= 8),
      waterNearby: nearbyWater.some(block => block.distance <= 8),
      fireNearby: nearbyDangers.some(block => /fire|campfire/.test(block.name) && block.distance <= 6),
      voidRisk: false,
      cliffNearby: false,
      standingInDanger: false
    }
    if (!base || !bot.blockAt) return result

    const feet = bot.blockAt(base)
    const below = bot.blockAt(base.offset(0, -1, 0))
    result.standingInDanger = ['lava', 'fire', 'soul_fire', 'cactus', 'magma_block'].includes(feet?.name) ||
      ['lava', 'fire', 'soul_fire'].includes(below?.name)

    const directions = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [1, -1], [-1, 1], [-1, -1]
    ]
    for (const [x, z] of directions) {
      const edge = base.offset(x, -1, z)
      const edgeBelow = bot.blockAt(edge)
      const deeper = bot.blockAt(edge.offset(0, -3, 0))
      if (edgeBelow?.boundingBox === 'empty' && deeper?.boundingBox === 'empty') result.cliffNearby = true
    }
    result.voidRisk = Number(bot.entity.position.y) < -55 || (result.cliffNearby && Number(bot.entity.position.y) < 5)
    return result
  }

  entitySummary(entity, base) {
    return {
      id: entity.id,
      name: entity.name || entity.username || entity.displayName || entity.type || 'unknown',
      username: entity.username || null,
      type: entity.type,
      position: entity.position ? {
        x: Number(entity.position.x),
        y: Number(entity.position.y),
        z: Number(entity.position.z)
      } : null,
      distance: entity.position && base ? entity.position.distanceTo(base) : Infinity
    }
  }

  dangerLevel(situation) {
    let danger = 0
    if (situation.health <= 6) danger += 5
    else if (situation.health <= 10) danger += 3
    if (situation.food <= 6) danger += 3
    else if (situation.food <= 10) danger += 1
    for (const hostile of situation.nearbyHostiles || []) {
      if (hostile.distance <= 4) danger += 4
      else if (hostile.distance <= 10) danger += 2
      else danger += 1
      if (['creeper', 'warden', 'piglin_brute', 'wither_skeleton', 'blaze'].includes(hostile.name)) danger += 2
    }
    if ((situation.nearbyDangers || []).some(block => block.distance <= 4)) danger += 3
    if (situation.environment?.standingInDanger) danger += 5
    if (situation.environment?.voidRisk) danger += 5
    if (situation.environment?.cliffNearby) danger += 2
    if (situation.dimension && String(situation.dimension).includes('nether')) danger += 1
    return Math.min(10, danger)
  }

  routeBlocked() {
    return Boolean(
      this.state.pathStatus === 'blocked' ||
      this.state.pendingNavigationRecovery ||
      Date.now() < Number(this.state.navigationBlockedUntil || 0) ||
      Number(this.state.unstuckFailures || 0) >= 2
    )
  }

  readyForDiamonds(situation) {
    const tools = situation.toolAvailability || {}
    return this.knowledgeService.toolTier(tools.pickaxe?.name) >= 3 &&
      Number(situation.armorScore || 0) >= 6 &&
      situation.hasShield &&
      (situation.hasFood || Number(situation.food || 0) >= 16) &&
      !situation.environment?.lavaNearby &&
      !situation.environment?.voidRisk
  }

  netherPreparationReady(situation) {
    const counts = this.knowledgeService.itemCounts(situation.inventoryItems || [])
    return Boolean(
      counts.obsidian >= 10 &&
      counts.flint_and_steel >= 1 &&
      situation.hasShield &&
      Number(situation.armorScore || 0) >= 8 &&
      (situation.hasFood || Number(situation.food || 0) >= 16)
    )
  }

  mcData() {
    if (typeof this.mcDataProvider === 'function') return this.mcDataProvider()
    return this.mcDataProvider
  }

  playerPvpEnabled() {
    if (typeof this.playerPvpEnabledProvider === 'function') return Boolean(this.playerPvpEnabledProvider())
    return Boolean(this.state.playerPvpEnabled)
  }
}

module.exports = { PerceptionBrain }
