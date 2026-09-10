function createNavigationService(bot, goals) {
  return {
    gotoNear(position, range = 2) {
      return bot.pathfinder.setGoal(new goals.GoalNear(position.x, position.y, position.z, range))
    },
    stop() {
      bot.pathfinder.setGoal(null)
      bot.clearControlStates()
    }
  }
}

module.exports = { createNavigationService }
