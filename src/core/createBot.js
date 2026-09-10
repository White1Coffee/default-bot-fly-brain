const mineflayer = require('mineflayer')

function createBot(options) {
  return mineflayer.createBot(options)
}

module.exports = { createBot }
