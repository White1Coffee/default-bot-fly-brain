'use strict'

// Info: Deze module kiest gedropte items centraal, zodat losse taakloops geen loot vergeten.
class ItemPickupSystem {
  constructor(bot, options = {}) {
    this.bot = bot
    this.navigate = options.navigate
    this.itemName = options.itemName || (() => null)
    this.isImportant = options.isImportant || (() => false)
    this.shouldCollect = options.shouldCollect || (() => true)
    this.isSafe = options.isSafe || (() => true)
    this.onStatus = options.onStatus || (() => {})
    this.onCollected = options.onCollected || (() => {})
    this.radius = Number(options.radius || 16)
    this.maxBatch = Number(options.maxBatch || 6)
    this.failedUntil = new Map()
  }

  // Info: Belangrijke/taakgebonden loot krijgt voorrang; daarna wordt de dichtstbijzijnde gewone drop gekozen.
  candidates() {
    const origin = this.bot.entity?.position
    if (!origin) return []
    const now = Date.now()
    return Object.values(this.bot.entities || {})
      .filter(entity => entity?.name === 'item' && entity.position && entity.position.distanceTo(origin) <= this.radius)
      .filter(entity => Number(this.failedUntil.get(entity.id) || 0) <= now)
      .filter(entity => this.shouldCollect(entity, this.itemName(entity)))
      .map(entity => {
        const name = this.itemName(entity)
        return { entity, name, distance: entity.position.distanceTo(origin), important: this.isImportant(entity, name) }
      })
      .filter(entry => this.hasInventoryCapacity(entry.name))
      .sort((left, right) => Number(right.important) - Number(left.important) || left.distance - right.distance || Number(left.entity.id || 0) - Number(right.entity.id || 0))
  }

  // Info: Een volle inventory kan nog steeds drops stapelen wanneer hetzelfde item al een onvolledige stack heeft.
  hasInventoryCapacity(name) {
    const inventory = this.bot.inventory
    if (!inventory) return false
    if (typeof inventory.emptySlotCount === 'function' && inventory.emptySlotCount() > 0) return true
    if (!name) return false
    return (inventory.items?.() || []).some(item => item.name === name && Number(item.count || 0) < Number(item.stackSize || 64))
  }

  count(name) {
    if (!name) return 0
    return (this.bot.inventory?.items?.() || []).filter(item => item.name === name).reduce((total, item) => total + Number(item.count || 0), 0)
  }

  // Info: Pickup is pas geslaagd als de entity weg is of de echte inventorytelling is gestegen.
  async collectOne(entry) {
    if (!entry || !this.isSafe()) return { success: false, reason: 'UNSAFE' }
    const before = this.count(entry.name)
    this.onStatus(entry)
    try {
      const reached = await this.navigate(entry.entity)
      if (reached === false) throw new Error('PATH_FAILED')
      await new Promise(resolve => setTimeout(resolve, 350))
      const entityGone = !this.bot.entities?.[entry.entity.id]
      const gained = entry.name ? this.count(entry.name) > before : false
      if (!entityGone && !gained) throw new Error('PICKUP_NOT_CONFIRMED')
      this.failedUntil.delete(entry.entity.id)
      const result = { success: true, name: entry.name, gained: Math.max(0, this.count(entry.name) - before) }
      this.onCollected(entry, result)
      return result
    } catch (error) {
      this.failedUntil.set(entry.entity.id, Date.now() + 5000)
      return { success: false, reason: error.code || error.message || 'PICKUP_FAILED' }
    }
  }

  // Info: Een korte batch voorkomt dat de bot na mijnen of combat na één drop alweer wegloopt.
  async collectBatch() {
    let collected = 0
    for (let attempt = 0; attempt < this.maxBatch; attempt++) {
      const next = this.candidates()[0]
      if (!next || !this.isSafe()) break
      const result = await this.collectOne(next)
      if (result.success) collected++
      else if (this.candidates().length === 0) break
    }
    return { success: collected > 0, collected }
  }
}

module.exports = { ItemPickupSystem }
