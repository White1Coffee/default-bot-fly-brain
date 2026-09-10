function minecraftConfig(settings, env = process.env) {
  return {
    host: env.MC_HOST || settings.host,
    port: Number(env.MC_PORT || settings.port),
    username: env.MC_USERNAME || settings.username,
    auth: env.MC_AUTH || settings.auth,
    version: settings.version
  }
}

module.exports = { minecraftConfig }
