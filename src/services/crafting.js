function createCraftingService(bot) {
  return {
    async craft(recipe, count = 1, table = null) {
      return bot.craft(recipe, count, table)
    }
  }
}

module.exports = { createCraftingService }
