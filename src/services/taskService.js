class TaskService {
  constructor(options = {}) {
    this.state = options.state || {}
    this.now = options.now || (() => Date.now())
    this.sequence = 0
  }

  start(plan = {}, situation = {}) {
    const timeoutMs = this.timeoutFor(plan.action)
    const task = {
      id: ++this.sequence,
      goal: plan.goal || 'unknown',
      action: plan.action || 'unknown',
      reason: plan.reason || 'no reason recorded',
      priority: Number(plan.priority || 0),
      score: Number(plan.score ?? plan.priority ?? 0),
      startedAt: this.now(),
      deadlineAt: this.now() + timeoutMs,
      timeoutMs,
      startSnapshot: this.snapshot(situation),
      status: 'running',
      cancelled: false
    }
    this.state.brainTask = task
    return task
  }

  complete(task, result = {}) {
    if (!task) return null
    task.status = result.success ? 'success' : 'failed'
    task.finishedAt = this.now()
    task.durationMs = task.finishedAt - task.startedAt
    task.success = Boolean(result.success)
    task.failReason = result.failReason || null
    task.endSnapshot = result.situation ? this.snapshot(result.situation) : null
    if (this.state.brainTask?.id === task.id) this.state.brainTask = null
    this.state.lastBrainTask = task
    return task
  }

  cancel(reason = 'cancelled') {
    const task = this.state.brainTask
    if (!task) return null
    task.cancelled = true
    return this.complete(task, { success: false, failReason: reason })
  }

  isExpired(task = this.state.brainTask) {
    return Boolean(task && this.now() > Number(task.deadlineAt || 0))
  }

  snapshot(situation = {}) {
    return {
      health: situation.health,
      food: situation.food,
      dangerLevel: situation.dangerLevel,
      position: situation.position || null,
      inventoryCount: Array.isArray(situation.inventoryItems) ? situation.inventoryItems.length : 0,
      nearbyHostiles: Array.isArray(situation.nearbyHostiles) ? situation.nearbyHostiles.length : 0,
      nearbyOres: Array.isArray(situation.nearbyOres) ? situation.nearbyOres.length : 0
    }
  }

  timeoutFor(action) {
    const table = {
      heal_or_retreat: 12000,
      eat: 8000,
      get_food: 90000,
      fight_or_flee: 20000,
      get_wood: 90000,
      craft_crafting_table: 25000,
      craft_pickaxe: 30000,
      get_stone_tools: 90000,
      craft_shield: 45000,
      get_iron: 180000,
      craft_iron_gear: 90000,
      mine_diamonds: 240000,
      prepare_nether: 180000
    }
    return table[action] || 60000
  }
}

module.exports = { TaskService }
