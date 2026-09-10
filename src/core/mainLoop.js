function createMainLoop(tick, intervalMs = 1000) {
  let running = false
  const timer = setInterval(async () => {
    if (running) return
    running = true
    try {
      await tick()
    } finally {
      running = false
    }
  }, intervalMs)
  return {
    stop: () => clearInterval(timer)
  }
}

module.exports = { createMainLoop }
