class CommandRegistry {
  constructor() {
    this.routes = new Map()
  }

  register(command, handler) {
    this.routes.set(command, handler)
  }

  async run(command, context) {
    const handler = this.routes.get(command)
    if (!handler) return false
    await handler(context)
    return true
  }
}

module.exports = { CommandRegistry }
