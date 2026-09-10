class FeedbackService {
  constructor(options = {}) {
    this.knowledge = options.knowledge || {}
    this.maxEntries = Number(options.maxEntries || 500)
  }

  record(task, result = {}) {
    if (!task) return null
    const feedback = this.knowledge.feedback ||= {
      actions: {},
      recent: [],
      deaths: {},
      failures: {},
      failureReasons: {}
    }
    const action = task.action || 'unknown'
    const bucket = feedback.actions[action] ||= {
      attempts: 0,
      successes: 0,
      failures: 0,
      totalDurationMs: 0,
      totalScore: 0,
      lastReason: null,
      lastAt: null
    }
    bucket.attempts += 1
    bucket.totalDurationMs += Number(task.durationMs || 0)
    bucket.totalScore += Number(task.score || 0)
    bucket.lastReason = result.failReason || task.reason || null
    bucket.lastAt = Date.now()
    if (result.success) bucket.successes += 1
    else {
      bucket.failures += 1
      const reason = this.normalizeReason(result.failReason || 'unknown')
      feedback.failures[reason] = (feedback.failures[reason] || 0) + 1
      feedback.failureReasons[reason] ||= {
        count: 0,
        actions: {},
        lastAt: null
      }
      feedback.failureReasons[reason].count += 1
      feedback.failureReasons[reason].actions[action] = (feedback.failureReasons[reason].actions[action] || 0) + 1
      feedback.failureReasons[reason].lastAt = Date.now()
    }

    const entry = {
      action,
      goal: task.goal,
      success: Boolean(result.success),
      failReason: result.failReason ? this.normalizeReason(result.failReason) : null,
      durationMs: task.durationMs || 0,
      score: task.score || 0,
      at: Date.now()
    }
    feedback.recent.unshift(entry)
    feedback.recent = feedback.recent.slice(0, this.maxEntries)
    return entry
  }

  actionReliability(action) {
    const stats = this.knowledge.feedback?.actions?.[action]
    if (!stats || !stats.attempts) return 0.5
    return stats.successes / Math.max(1, stats.attempts)
  }

  actionPenalty(action) {
    const reliability = this.actionReliability(action)
    const stats = this.knowledge.feedback?.actions?.[action]
    const failures = Number(stats?.failures || 0)
    const recentFailures = (this.knowledge.feedback?.recent || [])
      .filter(entry => entry.action === action && !entry.success)
      .slice(0, 6).length
    return Math.round((1 - reliability) * 20) + Math.min(18, recentFailures * 3) + Math.min(12, failures)
  }

  reasonPenalty(action, reason) {
    const normalized = this.normalizeReason(reason)
    const reasonStats = this.knowledge.feedback?.failureReasons?.[normalized]
    if (!reasonStats) return 0
    const actionFailures = Number(reasonStats.actions?.[action] || 0)
    return Math.min(25, actionFailures * 4)
  }

  normalizeReason(reason) {
    return String(reason || 'unknown')
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48) || 'unknown'
  }
}

module.exports = { FeedbackService }
