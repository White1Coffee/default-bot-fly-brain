function loadPlugins(bot, plugins = []) {
  for (const plugin of plugins) bot.loadPlugin(plugin)
  return bot
}

module.exports = { loadPlugins }
