/**
 * @typedef {{ mode: string, busy: boolean, currentTask: any, hardStopped: boolean }} BotState
 */

function createState(overrides = {}) {
  return {
    mode: 'idle',
    busy: false,
    currentTask: null,
    hardStopped: false,
    ...overrides
  }
}

module.exports = { createState }
