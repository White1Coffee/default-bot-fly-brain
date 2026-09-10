function createStorageService() {
  return {
    async deposit() {
      return false
    },
    async withdraw() {
      return false
    }
  }
}

module.exports = { createStorageService }
