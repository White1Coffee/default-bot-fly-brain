const fs = require('fs')
const path = require('path')
const pendingWrites = new Map()
const writeTimers = new Map()

function safeName(value, fallback = 'default') {
  const name = String(value || '').trim().replace(/[^a-z0-9_.-]/gi, '_')
  return name || fallback
}

const wait = delay => new Promise(resolve => setTimeout(resolve, delay))

async function replaceFileWithRetry(tempFile, file) {
  let lastError
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await fs.promises.rename(tempFile, file)
      return
    } catch (err) {
      lastError = err
      if (!['EEXIST', 'EPERM', 'EBUSY', 'UNKNOWN'].includes(err.code)) throw err
      try { await fs.promises.unlink(file) } catch (unlinkError) {
        if (unlinkError.code !== 'ENOENT' && !['EPERM', 'EBUSY', 'UNKNOWN'].includes(unlinkError.code)) throw unlinkError
      }
      await wait(50 * (attempt + 1))
    }
  }
  throw lastError
}

async function performJsonWrite(file, data) {
  await fs.promises.mkdir(path.dirname(file), { recursive: true })
  const tempFile = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
  try {
    await fs.promises.writeFile(tempFile, data)
    await replaceFileWithRetry(tempFile, file)
  } finally {
    try { await fs.promises.unlink(tempFile) } catch {}
  }
}

function queueJsonWrite(file) {
  const entry = pendingWrites.get(file)
  if (!entry || entry.running) return
  entry.running = true
  entry.dirty = false
  const data = entry.data
  performJsonWrite(file, data)
    .catch(err => console.log(`JSON save warning (${path.basename(file)}):`, err.message))
    .finally(() => {
      entry.running = false
      if (entry.dirty) queueJsonWrite(file)
      else pendingWrites.delete(file)
    })
}

function writeJsonSafe(file, value) {
  const data = JSON.stringify(value, null, 2)
  const entry = pendingWrites.get(file) || { data, running: false, dirty: false }
  entry.data = data
  entry.dirty = true
  pendingWrites.set(file, entry)
  clearTimeout(writeTimers.get(file))
  writeTimers.set(file, setTimeout(() => {
    writeTimers.delete(file)
    queueJsonWrite(file)
  }, 75))
  return true
}

async function flushJsonWrites() {
  for (const timer of writeTimers.values()) clearTimeout(timer)
  writeTimers.clear()
  for (const file of pendingWrites.keys()) queueJsonWrite(file)
  while (pendingWrites.size) await wait(10)
}

function cleanupStaleJsonTemps(root, minimumAgeMs = 60 * 60 * 1000) {
  if (!fs.existsSync(root)) return 0
  const now = Date.now()
  let removed = 0
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        visit(file)
        continue
      }
      if (!/\.json\.\d+\.\d+(?:\.[a-f0-9]+)?\.tmp$/i.test(entry.name)) continue
      try {
        if (now - fs.statSync(file).mtimeMs < minimumAgeMs) continue
        fs.unlinkSync(file)
        removed++
      } catch {}
    }
  }
  visit(root)
  return removed
}

function backupJsonTree(sourceRoot, backupRoot) {
  if (!fs.existsSync(sourceRoot)) return false
  fs.mkdirSync(backupRoot, { recursive: true })
  const ignoredDirectories = new Set(['.git', 'node_modules', 'backups', 'profiles'])
  const copy = (source, target) => {
    const stat = fs.statSync(source)
    if (stat.isDirectory()) {
      fs.mkdirSync(target, { recursive: true })
      for (const name of fs.readdirSync(source)) {
        if (!ignoredDirectories.has(name)) copy(path.join(source, name), path.join(target, name))
      }
      return
    }
    if (source.endsWith('.json')) fs.copyFileSync(source, target)
  }
  copy(sourceRoot, backupRoot)
  return true
}

function copyRuntimeData(sourceRoot, settingsFile, targetRoot) {
  fs.mkdirSync(targetRoot, { recursive: true })
  const copyJsonFile = (source, target) => {
    if (!fs.existsSync(source)) return
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(source, target)
  }
  const copyJsonDirectory = (source, target) => {
    if (!fs.existsSync(source)) return
    fs.mkdirSync(target, { recursive: true })
    for (const name of fs.readdirSync(source)) {
      const sourceFile = path.join(source, name)
      if (fs.statSync(sourceFile).isFile() && name.endsWith('.json')) copyJsonFile(sourceFile, path.join(target, name))
    }
  }
  copyJsonFile(settingsFile, path.join(targetRoot, 'bot-settings.json'))
  copyJsonFile(path.join(sourceRoot, 'ai-memory.json'), path.join(targetRoot, 'ai-memory.json'))
  copyJsonDirectory(path.join(sourceRoot, 'knowledge'), path.join(targetRoot, 'knowledge'))
  copyJsonDirectory(path.join(sourceRoot, 'worlds'), path.join(targetRoot, 'worlds'))
  return true
}

function restoreRuntimeData(backupRoot, targetRoot, settingsFile) {
  if (!fs.existsSync(backupRoot)) return false
  const removeJsonDirectory = directory => {
    if (!fs.existsSync(directory)) return
    for (const name of fs.readdirSync(directory)) {
      const file = path.join(directory, name)
      if (fs.statSync(file).isFile() && name.endsWith('.json')) fs.unlinkSync(file)
    }
  }
  removeJsonDirectory(path.join(targetRoot, 'knowledge'))
  removeJsonDirectory(path.join(targetRoot, 'worlds'))
  const targetMemory = path.join(targetRoot, 'ai-memory.json')
  if (fs.existsSync(targetMemory)) fs.unlinkSync(targetMemory)
  copyRuntimeData(backupRoot, path.join(backupRoot, 'bot-settings.json'), targetRoot)
  const backupSettings = path.join(backupRoot, 'bot-settings.json')
  if (fs.existsSync(backupSettings)) fs.copyFileSync(backupSettings, settingsFile)
  return true
}

module.exports = { safeName, writeJsonSafe, flushJsonWrites, cleanupStaleJsonTemps, backupJsonTree, copyRuntimeData, restoreRuntimeData }
