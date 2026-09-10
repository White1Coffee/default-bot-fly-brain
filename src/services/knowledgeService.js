const FOOD_VALUES = {
  golden_apple: 10,
  enchanted_golden_apple: 12,
  cooked_beef: 8,
  cooked_porkchop: 8,
  cooked_mutton: 6,
  cooked_chicken: 6,
  cooked_rabbit: 5,
  baked_potato: 5,
  bread: 5,
  carrot: 3,
  apple: 4,
  beetroot_soup: 6,
  mushroom_stew: 6,
  suspicious_stew: 6,
  pumpkin_pie: 8,
  melon_slice: 2,
  sweet_berries: 2,
  glow_berries: 2,
  beef: 3,
  porkchop: 3,
  mutton: 2,
  chicken: 2,
  rabbit: 3,
  potato: 1
}

const ARMOR_SCORES = {
  leather: 1,
  chainmail: 2,
  golden: 2,
  iron: 3,
  diamond: 4,
  netherite: 5,
  turtle: 2
}

const WEAPON_SCORES = {
  wooden_sword: 2,
  stone_sword: 3,
  iron_sword: 4,
  diamond_sword: 5,
  netherite_sword: 6,
  wooden_axe: 2.5,
  stone_axe: 3.5,
  iron_axe: 4.5,
  diamond_axe: 5.5,
  netherite_axe: 6.5,
  bow: 3,
  crossbow: 3.5,
  trident: 4
}

const TOOL_TIERS = {
  wooden: 1,
  stone: 2,
  golden: 2,
  iron: 3,
  diamond: 4,
  netherite: 5
}

const LOG_NAMES = [
  'oak_log', 'spruce_log', 'birch_log', 'jungle_log', 'acacia_log', 'dark_oak_log',
  'mangrove_log', 'cherry_log', 'pale_oak_log', 'crimson_stem', 'warped_stem',
  'stripped_oak_log', 'stripped_spruce_log', 'stripped_birch_log', 'stripped_jungle_log',
  'stripped_acacia_log', 'stripped_dark_oak_log', 'stripped_mangrove_log',
  'stripped_cherry_log', 'stripped_pale_oak_log', 'stripped_crimson_stem', 'stripped_warped_stem'
]

const PLANK_NAMES = [
  'oak_planks', 'spruce_planks', 'birch_planks', 'jungle_planks', 'acacia_planks',
  'dark_oak_planks', 'mangrove_planks', 'cherry_planks', 'pale_oak_planks',
  'crimson_planks', 'warped_planks'
]

class KnowledgeService {
  constructor(knowledge = {}) {
    this.knowledge = knowledge
    this.rules = {
      progressionLadder: [
        'survive',
        'wood',
        'crafting_table',
        'wooden_pickaxe',
        'stone_tools',
        'shield',
        'iron_tools',
        'iron_armor',
        'diamonds',
        'diamond_gear',
        'nether',
        'blaze_rods',
        'ender_pearls',
        'stronghold',
        'ender_dragon'
      ],
      craftingStations: {
        crafting_table: ['basic recipes', 'tools', 'shield', 'armor'],
        furnace: ['smelt ores', 'cook food', 'stone'],
        blast_furnace: ['smelt ores and metal gear faster'],
        smoker: ['cook food faster'],
        anvil: ['repair valuable gear', 'combine enchantments'],
        enchanting_table: ['upgrade combat and mining gear'],
        brewing_stand: ['potions for nether and end fights'],
        smithing_table: ['netherite upgrades']
      },
      toolRequirements: {
        stone: 'wooden_pickaxe',
        coal_ore: 'wooden_pickaxe',
        copper_ore: 'stone_pickaxe',
        iron_ore: 'stone_pickaxe',
        lapis_ore: 'stone_pickaxe',
        redstone_ore: 'iron_pickaxe',
        gold_ore: 'iron_pickaxe',
        diamond_ore: 'iron_pickaxe',
        emerald_ore: 'iron_pickaxe',
        obsidian: 'diamond_pickaxe',
        ancient_debris: 'diamond_pickaxe'
      },
      oreRequirements: {
        coal: ['wooden_pickaxe'],
        raw_iron: ['stone_pickaxe', 'iron_pickaxe', 'diamond_pickaxe', 'netherite_pickaxe'],
        raw_gold: ['iron_pickaxe', 'diamond_pickaxe', 'netherite_pickaxe'],
        diamond: ['iron_pickaxe', 'diamond_pickaxe', 'netherite_pickaxe'],
        redstone: ['iron_pickaxe', 'diamond_pickaxe', 'netherite_pickaxe'],
        lapis_lazuli: ['stone_pickaxe', 'iron_pickaxe', 'diamond_pickaxe', 'netherite_pickaxe'],
        ancient_debris: ['diamond_pickaxe', 'netherite_pickaxe']
      },
      foodPriorities: Object.keys(FOOD_VALUES).sort((a, b) => FOOD_VALUES[b] - FOOD_VALUES[a]),
      combatReadiness: {
        minimumHealth: 14,
        minimumFood: 14,
        minimumWeaponScore: 3,
        preferShield: true,
        preferArmorScore: 8
      },
      netherRequirements: {
        obsidian: 10,
        flint_and_steel: 1,
        shield: 1,
        bow: 1,
        arrows: 16,
        food: 12,
        armorScore: 8
      },
      endRequirements: {
        eyes_of_ender: 12,
        bow: 1,
        arrows: 32,
        water_bucket: 1,
        blocks: 64,
        food: 16,
        armorScore: 12
      },
      scenarioTraining: {
        zombie_1v1: ['keep spacing near 3 blocks', 'hit only when canHit is true', 'backpedal below 2.5 blocks'],
        skeleton_1v1: ['shield when line-of-sight exists', 'zigzag while closing distance', 'attack under 3.5 blocks'],
        cave_mining: ['scan lava and cliffs first', 'mine needed ores first', 'keep escape route available'],
        food_gathering: ['prefer renewable crops and breeding', 'hunt only when food is low'],
        crafting_chain: ['check owned tools before crafting duplicates', 'use nearest known crafting station'],
        escape_hole: ['use pickaxe for stone', 'pillar only when digging is unsafe', 'avoid trapping self with protected blocks'],
        bridge_gap: ['place verified blocks', 'avoid void edges', 'stop if route becomes unsafe'],
        death_recovery: ['skip recovery when keepInventory is true', 'avoid repeated death zone routes']
      }
    }
  }

  itemCount(items, name) {
    return this.itemCounts(items)[name] || 0
  }

  itemCounts(items = []) {
    const counts = {}
    for (const item of items || []) {
      if (!item?.name) continue
      counts[item.name] = (counts[item.name] || 0) + Number(item.count || 1)
    }
    return counts
  }

  hasAny(items, names = []) {
    const counts = this.itemCounts(items)
    return names.some(name => counts[name] > 0)
  }

  hasWood(items = []) {
    const counts = this.itemCounts(items)
    return [...LOG_NAMES, ...PLANK_NAMES].some(name => counts[name] > 0)
  }

  woodCount(items = []) {
    const counts = this.itemCounts(items)
    return LOG_NAMES.reduce((sum, name) => sum + (counts[name] || 0) * 4, 0) +
      PLANK_NAMES.reduce((sum, name) => sum + (counts[name] || 0), 0)
  }

  hasFood(items = []) {
    return Object.keys(this.foodCounts(items)).length > 0
  }

  foodCounts(items = []) {
    const counts = this.itemCounts(items)
    const foods = {}
    for (const [name, value] of Object.entries(FOOD_VALUES)) {
      if (counts[name]) foods[name] = { count: counts[name], value }
    }
    return foods
  }

  bestFood(items = []) {
    const foods = this.foodCounts(items)
    return Object.entries(foods)
      .sort((a, b) => b[1].value - a[1].value || b[1].count - a[1].count)
      .map(([name, meta]) => ({ name, ...meta }))[0] || null
  }

  armorScore(items = []) {
    let score = 0
    for (const item of items || []) {
      const name = item?.name || ''
      for (const [tier, value] of Object.entries(ARMOR_SCORES)) {
        if (name.includes(tier) && /helmet|chestplate|leggings|boots/.test(name)) score += value
      }
    }
    return score
  }

  weaponScore(items = []) {
    let score = 0
    for (const item of items || []) {
      const value = WEAPON_SCORES[item?.name]
      if (value && value > score) score = value
    }
    return score
  }

  toolAvailability(items = []) {
    const tools = {
      pickaxe: null,
      axe: null,
      shovel: null,
      sword: null,
      hoe: null,
      bow: null,
      crossbow: null,
      shield: null,
      bucket: null,
      water_bucket: null,
      boat: null
    }
    for (const item of items || []) {
      const name = item?.name || ''
      if (name === 'bow') tools.bow = item
      if (name === 'crossbow') tools.crossbow = item
      if (name === 'shield') tools.shield = item
      if (name === 'bucket') tools.bucket = item
      if (name === 'water_bucket') tools.water_bucket = item
      if (name.endsWith('_boat')) tools.boat = item
      for (const type of ['pickaxe', 'axe', 'shovel', 'sword', 'hoe']) {
        if (!name.endsWith(`_${type}`)) continue
        if (!tools[type] || this.toolTier(name) > this.toolTier(tools[type].name)) tools[type] = item
      }
    }
    return tools
  }

  toolTier(name = '') {
    const tier = Object.keys(TOOL_TIERS).find(prefix => name.startsWith(`${prefix}_`))
    return tier ? TOOL_TIERS[tier] : 0
  }

  hasStoneTools(items = []) {
    const tools = this.toolAvailability(items)
    return this.toolTier(tools.pickaxe?.name) >= 2 && this.weaponScore(items) >= 3
  }

  hasIronGear(items = []) {
    const tools = this.toolAvailability(items)
    return this.toolTier(tools.pickaxe?.name) >= 3 && this.armorScore(items) >= 8
  }

  hasGoodGear(items = []) {
    const tools = this.toolAvailability(items)
    return this.toolTier(tools.pickaxe?.name) >= 4 && this.armorScore(items) >= 10 && this.weaponScore(items) >= 4
  }

  combatReadiness(situation = {}) {
    const items = situation.inventoryItems || []
    const rules = this.rules.combatReadiness
    const hasConsumables = this.hasFood(items) || this.itemCount(items, 'golden_apple') > 0
    return {
      ready: Number(situation.health || 0) >= rules.minimumHealth &&
        Number(situation.food || 0) >= rules.minimumFood &&
        Number(situation.weaponScore || 0) >= rules.minimumWeaponScore &&
        (!rules.preferShield || Boolean(situation.hasShield)) &&
        Number(situation.armorScore || 0) >= rules.preferArmorScore,
      hasConsumables,
      shouldRetreat: Number(situation.health || 0) <= 8 || Number(situation.food || 0) <= 6
    }
  }

  netherReady(situation = {}) {
    const counts = this.itemCounts(situation.inventoryItems || [])
    const foodTotal = Object.values(this.foodCounts(situation.inventoryItems || {})).reduce((sum, entry) => sum + entry.count, 0)
    const req = this.rules.netherRequirements
    return Boolean(
      counts.obsidian >= req.obsidian &&
      counts.flint_and_steel >= req.flint_and_steel &&
      situation.hasShield &&
      (counts.bow >= req.bow || counts.crossbow >= req.bow) &&
      counts.arrow >= req.arrows &&
      foodTotal >= req.food &&
      Number(situation.armorScore || 0) >= req.armorScore
    )
  }

  endReady(situation = {}) {
    const counts = this.itemCounts(situation.inventoryItems || [])
    const foodTotal = Object.values(this.foodCounts(situation.inventoryItems || {})).reduce((sum, entry) => sum + entry.count, 0)
    const req = this.rules.endRequirements
    return Boolean(
      counts.ender_eye >= req.eyes_of_ender &&
      (counts.bow >= req.bow || counts.crossbow >= req.bow) &&
      counts.arrow >= req.arrows &&
      counts.water_bucket >= req.water_bucket &&
      this.blockCount(counts) >= req.blocks &&
      foodTotal >= req.food &&
      Number(situation.armorScore || 0) >= req.armorScore
    )
  }

  blockCount(counts = {}) {
    return Object.entries(counts).reduce((sum, [name, count]) => {
      if (/_planks$|stone$|cobblestone$|dirt$|netherrack$|end_stone$|deepslate$/.test(name)) return sum + count
      return sum
    }, 0)
  }
}

module.exports = {
  KnowledgeService,
  FOOD_VALUES,
  LOG_NAMES,
  PLANK_NAMES
}
