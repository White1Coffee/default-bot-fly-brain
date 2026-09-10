class RankingService {
  constructor(options = {}) {
    this.feedbackService = options.feedbackService || null
  }

  rank(plan, situation = {}) {
    const reward = this.reward(plan, situation)
    const risk = this.risk(plan, situation)
    const timeCost = this.timeCost(plan, situation)
    const learnedPenalty = this.feedbackService?.actionPenalty?.(plan.action) || 0
    const preparationPenalty = this.preparationPenalty(plan, situation)
    const score = reward - risk - timeCost - learnedPenalty - preparationPenalty
    return {
      ...plan,
      reward,
      risk,
      timeCost,
      learnedPenalty,
      preparationPenalty,
      score
    }
  }

  best(plans = [], situation = {}) {
    return plans
      .map(plan => this.rank(plan, situation))
      .sort((left, right) => right.score - left.score || right.priority - left.priority)[0] || null
  }

  reward(plan, situation) {
    const base = Number(plan.priority || 0)
    const action = plan.action
    if (action === 'heal_or_retreat' && situation.health <= 10) return base + 40
    if (action === 'eat' && situation.food <= 12) return base + 25
    if (action === 'fight_or_flee' && (situation.nearbyHostiles || []).length) return base + 20
    if (action === 'craft_shield' && !situation.hasShield) return base + 18
    if (action === 'equip_armor' && (situation.armorInInventory || []).length) return base + 32
    if (action === 'get_iron' && situation.hasPickaxe) return base + 15
    if (action === 'mine_diamonds' && situation.readyForDiamonds) return base + 22
    if (action === 'prepare_nether' && situation.netherPreparationReady) return base + 24
    return base
  }

  risk(plan, situation) {
    let risk = Number(situation.dangerLevel || 0) * 4
    const action = plan.action
    if (['mine_diamonds', 'get_iron'].includes(action)) {
      risk += Number(situation.environment?.lavaNearby ? 18 : 0)
      risk += Number(situation.environment?.cliffNearby ? 10 : 0)
      if (!situation.hasPickaxe) risk += 100
    }
    if (action === 'fight_or_flee') {
      risk += Math.max(0, (situation.nearbyHostiles || []).length - 1) * 18
      if (situation.health <= 10) risk += 40
    }
    if (action === 'mine_diamonds' && !situation.readyForDiamonds) risk += 70
    if (action === 'prepare_nether') {
      if (!situation.hasShield) risk += 35
      if (Number(situation.armorScore || 0) < 8) risk += 35
      if (Number(situation.food || 0) < 16 && !situation.hasFood) risk += 25
      if (situation.environment?.lavaNearby) risk += 10
    }
    if (action === 'get_food' && situation.food >= 18) risk += 35
    if (action !== 'heal_or_retreat' && action !== 'eat') {
      if (situation.health <= 8) risk += 80
      if (situation.food <= 6) risk += 45
    }
    return risk
  }

  timeCost(plan, situation) {
    const table = {
      heal_or_retreat: 5,
      eat: 2,
      equip_armor: 3,
      fight_or_flee: 8,
      craft_crafting_table: 4,
      craft_pickaxe: 6,
      craft_shield: 8,
      get_wood: 14,
      get_food: 16,
      get_stone_tools: 18,
      get_iron: 24,
      craft_iron_gear: 12,
      mine_diamonds: 35,
      prepare_nether: 40
    }
    let cost = table[plan.action] || 15
    if (situation.routeBlocked) cost += 20
    return cost
  }

  preparationPenalty(plan, situation) {
    const action = plan.action
    let penalty = 0
    if (['get_iron', 'mine_diamonds', 'prepare_nether'].includes(action)) {
      if (!situation.hasPickaxe) penalty += 100 + (this.feedbackService?.reasonPenalty?.(action, 'no_tool') || 0)
      if (situation.routeBlocked) penalty += this.feedbackService?.reasonPenalty?.(action, 'no_path') || 12
      if (situation.environment?.lavaNearby) penalty += this.feedbackService?.reasonPenalty?.(action, 'lava_nearby') || 8
      if (situation.dangerLevel >= 7) penalty += this.feedbackService?.reasonPenalty?.(action, 'danger') || 12
    }
    if (action === 'craft_iron_gear' && situation.missingCraftingStation) penalty += 20
    return penalty
  }
}

module.exports = { RankingService }
