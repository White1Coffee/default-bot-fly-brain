class ActionExecutor {
  constructor(options = {}) {
    this.bot = options.bot
    this.state = options.state || {}
    this.knowledge = options.knowledge || {}
    this.actions = options.actions || {}
    this.log = options.log || console.log
    this.taskService = options.taskService || null
    this.feedbackService = options.feedbackService || null
    this.lastActionAt = 0
    this.lastAction = null
    this.minActionIntervalMs = Number(options.minActionIntervalMs || 2500)
    this.failureCounts = new Map()
    this.cooldownUntil = new Map()
    this.repeatCooldownReasons = new Set(['task_timeout', 'no_progress', 'no_path'])
  }

  async execute(plan, situation = {}) {
    if (!plan?.action) {
      this.write('[Executor] skipped: no action selected')
      return false
    }

    const now = Date.now()
    const repeatCooldownUntil = this.cooldownUntil.get(plan.action) || 0
    if (repeatCooldownUntil > now) {
      const secondsLeft = Math.ceil((repeatCooldownUntil - now) / 1000)
      this.write(`[Executor] skipped ${plan.action}: repeat cooldown ${secondsLeft}s`)
      return false
    }

    if (this.lastAction === plan.action && now - this.lastActionAt < this.minActionIntervalMs) {
      this.write(`[Executor] skipped ${plan.action}: cooldown`)
      return false
    }

    const handler = this.actions[plan.action]
    if (typeof handler !== 'function') {
      this.write(`[Executor] skipped ${plan.action}: no legacy adapter connected yet`)
      return false
    }

    this.lastAction = plan.action
    this.lastActionAt = now
    const task = this.taskService?.start?.(plan, situation) || null
    this.write(`[Executor] action started: ${plan.action}${task ? ` task=${task.id}` : ''}`)

    try {
      const result = await handler(plan, situation)
      const normalized = this.normalizeResult(result, situation)
      const expired = this.taskService?.isExpired?.(task)
      const success = normalized.success && !expired
      const failReason = expired ? 'task_timeout' : normalized.failReason
      const finishedTask = this.taskService?.complete?.(task, { success, failReason, situation })
      this.feedbackService?.record?.(finishedTask || task || this.feedbackTask(plan, now), { success, failReason })
      if (success) {
        this.clearFailure(plan.action)
        this.write(`[Executor] action completed: ${plan.action}`)
        return true
      }
      this.recordFailure(plan.action, failReason)
      this.write(`[Executor] action skipped: ${plan.action}${failReason ? ` (${failReason})` : ''}`)
      return false
    } catch (err) {
      const failReason = this.normalizeFailReason(err?.code || err?.message || String(err), situation)
      const finishedTask = this.taskService?.complete?.(task, { success: false, failReason, situation })
      this.feedbackService?.record?.(finishedTask || task || this.feedbackTask(plan, now), { success: false, failReason })
      this.recordFailure(plan.action, failReason)
      this.write(`[Executor] action failed: ${plan.action}: ${err?.message || err}`)
      return false
    }
  }

  clearFailure(action) {
    this.failureCounts.delete(action)
    this.cooldownUntil.delete(action)
  }

  recordFailure(action, reason) {
    if (!this.repeatCooldownReasons.has(reason)) return
    const failures = (this.failureCounts.get(action) || 0) + 1
    this.failureCounts.set(action, failures)
    if (failures < 2) return
    const cooldownMs = Math.min(180000, 30000 * failures)
    this.cooldownUntil.set(action, Date.now() + cooldownMs)
    this.write(`[Executor] ${action} paused after ${failures} repeated ${reason} results (${Math.ceil(cooldownMs / 1000)}s)`)
  }

  write(message) {
    try {
      this.log(message)
    } catch {
      console.log(message)
    }
  }

  normalizeResult(result, situation = {}) {
    if (result && typeof result === 'object') {
      return {
        success: result.success !== false,
        failReason: result.success === false ? this.normalizeFailReason(result.failReason || result.reason, situation) : null
      }
    }
    return {
      success: Boolean(result),
      failReason: result ? null : this.normalizeFailReason('handler_returned_false', situation)
    }
  }

  feedbackTask(plan, startedAt) {
    return {
      action: plan.action || 'unknown',
      goal: plan.goal || 'unknown',
      reason: plan.reason || null,
      priority: Number(plan.priority || 0),
      score: Number(plan.score ?? plan.priority ?? 0),
      startedAt,
      finishedAt: Date.now(),
      durationMs: Math.max(0, Date.now() - startedAt)
    }
  }

  normalizeFailReason(reason, situation = {}) {
    const text = String(reason || '').toLowerCase()
    if (situation.environment?.lavaNearby || /lava/.test(text)) return 'lava_nearby'
    if (situation.environment?.voidRisk || situation.environment?.cliffNearby || /void|cliff|fall/.test(text)) return 'danger'
    if (situation.dangerLevel >= 7 || /danger|hostile|mob|combat/.test(text)) return 'danger'
    if (situation.routeBlocked || /no path|nopath|path|route|unreachable|blocked/.test(text)) return 'no_path'
    if (/tool|pickaxe|axe|harvest/.test(text)) return 'no_tool'
    if (/recipe|craft|ingredient|material/.test(text)) return 'missing_recipe'
    if (/inventory|full|space/.test(text)) return 'inventory_full'
    if (/dark|light/.test(text)) return 'too_dark'
    if (/timeout|expired/.test(text)) return 'task_timeout'
    if (/cooldown/.test(text)) return 'cooldown'
    if (!text || text === 'handler_returned_false') return 'no_progress'
    return text.replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'unknown'
  }
}

module.exports = { ActionExecutor }
