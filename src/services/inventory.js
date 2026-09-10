function createInventoryService(bot) {
  return {
    count(name) {
      return bot.inventory.items().filter(item => item.name === name).reduce((sum, item) => sum + item.count, 0)
    },
    find(name) {
      return bot.inventory.items().find(item => item.name === name) || null
    },
    has(name, count = 1) {
      return this.count(name) >= count
    }
  }
}

module.exports = { createInventoryService }
