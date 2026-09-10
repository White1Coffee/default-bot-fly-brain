class RecoverySystem {
  constructor(bot, state) {
    this.bot = bot
    this.state = state
  }

  onDeath() {
    this.state.mode = 'recovering'
  }
}

module.exports = { RecoverySystem }
