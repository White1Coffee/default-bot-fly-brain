const { KnowledgeService } = require('../services/knowledgeService')
const { RankingService } = require('../services/rankingService')

class PlannerBrain {
  constructor(options = {}) {
    this.knowledgeService = options.knowledgeService || new KnowledgeService(options.knowledge || {})
    this.rankingService = options.rankingService || new RankingService({ feedbackService: options.feedbackService || null })
  }

  choose(situation = {}) {
    const items = situation.inventoryItems || []
    const counts = this.knowledgeService.itemCounts(items)
    const tools = situation.toolAvailability || this.knowledgeService.toolAvailability(items)
    const hostileNearby = (situation.nearbyHostiles || []).some(entity => entity.distance <= 10)
    const playerThreatNearby = Boolean(situation.playerPvpEnabled) &&
      (situation.nearbyPlayers || []).some(entity => entity.distance <= 8)
    const candidates = []

    if (Number(situation.health || 0) <= 8) {
      candidates.push(this.plan('survive', 'heal_or_retreat', 'health is low', 100))
    }

    if (Number(situation.food || 0) <= 8) {
      candidates.push(situation.hasFood
        ? this.plan('restore food', 'eat', 'food is low and food is available', 95)
        : this.plan('restore food', 'get_food', 'food is low and no food is available', 94))
    }

    if (hostileNearby || playerThreatNearby) {
      candidates.push(this.plan('stay alive', 'fight_or_flee', hostileNearby ? 'hostile mob is nearby' : 'player threat is nearby and PvP is enabled', 90))
    }

    if ((situation.armorInInventory || []).length && (situation.armorItems || []).length < 4) {
      candidates.push(this.plan('combat safety', 'equip_armor', 'armor is available but not equipped', 88))
    }

    if (!this.knowledgeService.hasWood(items)) {
      candidates.push(this.plan('basic resources', 'get_wood', 'no wood or planks in inventory', 80))
    }

    if (!counts.crafting_table) {
      candidates.push(this.plan('basic crafting', 'craft_crafting_table', 'no crafting table available', 76))
    }

    if (!tools.pickaxe) {
      candidates.push(this.plan('basic tools', 'craft_pickaxe', 'no pickaxe available', 74))
    }

    if (!this.knowledgeService.hasStoneTools(items)) {
      candidates.push(this.plan('stone tools', 'get_stone_tools', 'stone-level tools are missing', 70))
    }

    const plankCount = Object.entries(counts).filter(([name]) => name.endsWith('_planks')).reduce((total, [,count]) => total + count, 0)
    const logCount = Object.entries(counts).filter(([name]) => name.endsWith('_log') || name.endsWith('_stem')).reduce((total, [,count]) => total + count, 0)
    const canPrepareShield = Number(counts.iron_ingot || 0) >= 1 && (plankCount >= 6 || logCount >= 2)
    if (!situation.hasShield && canPrepareShield) {
      candidates.push(this.plan('combat safety', 'craft_shield', 'shield is missing before dangerous progression', 72))
    }

    const ironTotal = (counts.iron_ingot || 0) + (counts.raw_iron || 0)
    const strongArmorEquipped = Number(situation.armorScore || 0) >= 8
    if (!this.knowledgeService.hasIronGear([...items, ...(situation.armorItems || [])]) && ironTotal < 24) {
      candidates.push(this.plan('iron progression', 'get_iron', 'iron gear is not complete', 62))
    }

    if (!this.knowledgeService.hasIronGear([...items, ...(situation.armorItems || [])]) && ironTotal >= 8) {
      candidates.push(this.plan('iron progression', 'craft_iron_gear', 'enough iron exists to craft upgrades', 60))
    }

    if (this.readyForDiamonds(situation)) {
      candidates.push(this.plan('diamond progression', 'mine_diamonds', 'iron gear and survival basics are ready', 52))
    }

    if (this.knowledgeService.hasGoodGear([...items, ...(situation.armorItems || [])]) || situation.netherPreparationReady) {
      candidates.push(this.plan(
        'nether preparation',
        'prepare_nether',
        situation.netherPreparationReady ? 'portal materials and survival gear are ready' : 'gear is strong enough to prepare for the Nether',
        strongArmorEquipped ? 58 : 44
      ))
    }

    candidates.push(this.plan('progression', 'get_iron', 'default progression: improve tools, armor and resources', 25))
    const best = this.rankingService.best(candidates, situation)
    return best || this.plan('progression', 'get_iron', 'fallback progression plan', 1)
  }

  readyForDiamonds(situation = {}) {
    const items = situation.inventoryItems || []
    const tools = situation.toolAvailability || this.knowledgeService.toolAvailability(items)
    return this.knowledgeService.toolTier(tools.pickaxe?.name) >= 3 &&
      Number(situation.armorScore || 0) >= 6 &&
      Boolean(situation.hasShield) &&
      (situation.hasFood || Number(situation.food || 0) >= 16)
  }

  plan(goal, action, reason, priority) {
    return { goal, action, reason, priority }
  }
}

module.exports = { PlannerBrain }
