function createMemoryService(knowledge) {
  return {
    knowledge,
    remember(domain, key, value) {
      knowledge[domain] ||= {}
      knowledge[domain][key] = value
    }
  }
}

module.exports = { createMemoryService }
