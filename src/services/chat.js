function createChatService(bot) {
  return {
    say(message) {
      bot.chat(String(message))
    }
  }
}

module.exports = { createChatService }
