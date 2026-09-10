class MiningBrain {
  constructor(bot, state, knowledge) {
    this.bot = bot
    this.state = state
    this.knowledge = knowledge
  }

  startStripmine(item = 'diamond') {
    this.state.mode = 'stripmine'
    this.state.miningTask = { item, style: 'stripmine' }
  }

  async tick() {
    return false
  }
}

module.exports = { MiningBrain }
