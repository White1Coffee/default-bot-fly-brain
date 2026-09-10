const test = require('node:test')
const assert = require('node:assert/strict')
const { ItemPickupSystem } = require('../src/systems/itemPickupSystem')

function position(x, y = 64, z = 0) {
  return { x, y, z, distanceTo(other) { return Math.hypot(x - other.x, y - other.y, z - other.z) } }
}

test('pickup prioritizes important loot and validates the real inventory change', async () => {
  const stacks = []
  const bot = {
    entity: { position: position(0) },
    entities: {
      1: { id: 1, name: 'item', position: position(2), itemName: 'cobblestone' },
      2: { id: 2, name: 'item', position: position(5), itemName: 'diamond' }
    },
    inventory: { emptySlotCount: () => 2, items: () => stacks }
  }
  const order = []
  const pickup = new ItemPickupSystem(bot, {
    itemName: entity => entity.itemName,
    isImportant: (_entity, name) => name === 'diamond',
    navigate: async entity => {
      order.push(entity.itemName)
      stacks.push({ name: entity.itemName, count: 1, stackSize: 64 })
      delete bot.entities[entity.id]
      return true
    }
  })

  const result = await pickup.collectBatch()
  assert.equal(result.success, true)
  assert.equal(result.collected, 2)
  assert.deepEqual(order, ['diamond', 'cobblestone'])
})

test('pickup skips items when a full inventory cannot stack them', () => {
  const bot = {
    entity: { position: position(0) },
    entities: { 1: { id: 1, name: 'item', position: position(2), itemName: 'iron_ingot' } },
    inventory: { emptySlotCount: () => 0, items: () => [{ name: 'cobblestone', count: 64, stackSize: 64 }] }
  }
  const pickup = new ItemPickupSystem(bot, { itemName: entity => entity.itemName, navigate: async () => true })
  assert.deepEqual(pickup.candidates(), [])
})

test('failed pickup gets a cooldown instead of blocking other drops', async () => {
  const bot = {
    entity: { position: position(0) },
    entities: {
      1: { id: 1, name: 'item', position: position(1), itemName: 'dirt' },
      2: { id: 2, name: 'item', position: position(2), itemName: 'apple' }
    },
    inventory: { emptySlotCount: () => 2, items: () => [] }
  }
  const pickup = new ItemPickupSystem(bot, {
    maxBatch: 2,
    itemName: entity => entity.itemName,
    navigate: async entity => {
      if (entity.id === 1) return false
      delete bot.entities[entity.id]
      return true
    }
  })
  const result = await pickup.collectBatch()
  assert.equal(result.collected, 1)
  assert.ok(pickup.failedUntil.get(1) > Date.now())
})
