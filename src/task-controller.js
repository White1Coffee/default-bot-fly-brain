class TaskController {
  constructor() {
    this.sequence = 0
    this.active = null
  }

  begin(label, source = 'system') {
    if (this.active) this.active.cancelled = true
    this.active = {
      id: ++this.sequence,
      label: String(label || 'task'),
      source,
      cancelled: false,
      startedAt: Date.now()
    }
    return this.active
  }

  cancel(reason = 'cancelled') {
    if (this.active) {
      this.active.cancelled = true
      this.active.cancelReason = reason
    }
    this.active = null
  }

  cancelIfActive(token, reason = 'cancelled') {
    if (!this.isActive(token)) return false
    this.cancel(reason)
    return true
  }

  isActive(token) {
    return Boolean(token && this.active === token && !token.cancelled)
  }
}

module.exports = { TaskController }
