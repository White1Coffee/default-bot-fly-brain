class SurvivalBrain {
  constructor(bot, state, knowledge) {
    this.bot = bot
    this.state = state
    this.knowledge = knowledge
  }

  async tick() {
    return false
  }
}

module.exports = { SurvivalBrain }
