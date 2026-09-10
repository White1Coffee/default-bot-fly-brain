const { CommandRegistry } = require('./commandRegistry')

function createCommandHandler() {
  return new CommandRegistry()
}

module.exports = { createCommandHandler }
