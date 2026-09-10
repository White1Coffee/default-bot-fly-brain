class HudSystem {
  constructor(io, state) {
    this.io = io
    this.state = state
  }

  update(payload) {
    this.io.emit('update', payload)
  }
}

module.exports = { HudSystem }
