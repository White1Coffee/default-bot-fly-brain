const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { writeJsonSafe, flushJsonWrites, cleanupStaleJsonTemps, copyRuntimeData, restoreRuntimeData } = require('../src/runtime-storage')

function tempDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'minecraft-ai-bot-'))
}

test('queued JSON writes are coalesced and keep the latest valid value', async () => {
  const root = tempDirectory()
  const file = path.join(root, 'knowledge', 'mining.json')
  try {
    for (let value = 0; value < 50; value++) writeJsonSafe(file, { value })
    await flushJsonWrites()
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { value: 49 })
    assert.equal(fs.readdirSync(path.dirname(file)).filter(name => name.endsWith('.tmp')).length, 0)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('stale JSON temp files are removed without touching recent writes', () => {
  const root = tempDirectory()
  try {
    const oldTemp = path.join(root, 'mining.json.123.456.abcdef.tmp')
    const recentTemp = path.join(root, 'movement.json.123.789.abcdef.tmp')
    fs.writeFileSync(oldTemp, '{}')
    fs.writeFileSync(recentTemp, '{}')
    const oldTime = new Date(Date.now() - 2 * 60 * 60 * 1000)
    fs.utimesSync(oldTemp, oldTime, oldTime)

    assert.equal(cleanupStaleJsonTemps(root), 1)
    assert.equal(fs.existsSync(oldTemp), false)
    assert.equal(fs.existsSync(recentTemp), true)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('runtime restore removes JSON files that are not in the backup', () => {
  const root = tempDirectory()
  const source = path.join(root, 'source')
  const backup = path.join(root, 'backup')
  const target = path.join(root, 'target')
  const settings = path.join(root, 'bot-settings.json')
  try {
    fs.mkdirSync(path.join(source, 'knowledge'), { recursive: true })
    fs.mkdirSync(path.join(source, 'worlds'), { recursive: true })
    fs.writeFileSync(path.join(source, 'knowledge', 'mining.json'), '{"restored":true}')
    fs.writeFileSync(path.join(source, 'worlds', 'world.json'), '{"restored":true}')
    fs.writeFileSync(path.join(source, 'ai-memory.json'), '{"restored":true}')
    fs.writeFileSync(path.join(source, 'bot-settings.json'), '{"restored":true}')
    copyRuntimeData(source, path.join(source, 'bot-settings.json'), backup)
    copyRuntimeData(source, path.join(source, 'bot-settings.json'), target)
    fs.writeFileSync(path.join(target, 'knowledge', 'stale.json'), '{}')
    fs.writeFileSync(path.join(target, 'worlds', 'stale.json'), '{}')

    restoreRuntimeData(backup, target, settings)

    assert.equal(fs.existsSync(path.join(target, 'knowledge', 'stale.json')), false)
    assert.equal(fs.existsSync(path.join(target, 'worlds', 'stale.json')), false)
    assert.deepEqual(JSON.parse(fs.readFileSync(settings, 'utf8')), { restored: true })
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
