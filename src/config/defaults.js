const APP_TIME_ZONE = 'Europe/Amsterdam'
const minecraftProtocol = require('minecraft-protocol')
const SUPPORTED_MINECRAFT_VERSIONS = [...minecraftProtocol.supportedVersions].reverse()

module.exports = { APP_TIME_ZONE, SUPPORTED_MINECRAFT_VERSIONS }
