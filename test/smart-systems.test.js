const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { WorldScanner } = require('../src/systems/worldScanner')
const { ActionExecutor } = require('../src/brains/actionExecutor')
const { FeedbackService } = require('../src/services/feedbackService')
const { RankingService } = require('../src/services/rankingService')
const { PlannerBrain } = require('../src/brains/plannerBrain')

function pos(x, y, z) {
  return { x, y, z }
}

test('planner only proposes a shield when iron and enough wood are available', () => {
  const planner = new PlannerBrain({ rankingService:{ best:candidates=>candidates.find(candidate=>candidate.action==='craft_shield')||candidates[0] } })
  const base = { health:20,food:20,hasFood:true,hasShield:false,inventoryItems:[{name:'oak_planks',count:6},{name:'crafting_table',count:1},{name:'stone_pickaxe',count:1},{name:'stone_sword',count:1}],nearbyHostiles:[],nearbyPlayers:[],armorInInventory:[],armorItems:[] }
  assert.notEqual(planner.choose(base).action, 'craft_shield')
  assert.equal(planner.choose({ ...base,inventoryItems:[...base.inventoryItems,{name:'iron_ingot',count:1}] }).action, 'craft_shield')
})

test('runtime waits at least five seconds before reconnecting and guards bridge references', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'legacyBot.js'), 'utf8')
  assert.match(source, /const delayMs = 5000/)
  assert.match(source, /if \(!referenceBlock\?\.position \|\| !canUseAsPlacementFloor\(referenceBlock\)\)/)
  assert.match(source, /bot\.placeBlock\(referenceBlock, face\)/)
})

test('world scanner records useful features and ore heatmap entries', async () => {
  const blocks = [
    { name: 'iron_ore', position: pos(17, 20, 0) },
    { name: 'lava', position: pos(5, 12, 0) },
    { name: 'crafting_table', position: pos(2, 12, 0) },
    { name: 'nether_portal', position: pos(4, 12, 0) }
  ]
  const mcData = {
    blocksByName: Object.fromEntries(blocks.map((block, index) => [block.name, { id: index + 1 }]))
  }
  const bot = {
    entity: { position: pos(0, 12, 0) },
    findBlocks({ matching }) {
      return blocks.filter(block => matching.includes(mcData.blocksByName[block.name].id)).map(block => block.position)
    },
    blockAt(position) {
      return blocks.find(block => block.position === position) || { name: 'air', boundingBox: 'empty' }
    }
  }
  const worldMemory = {}
  let saves = 0
  const scanner = new WorldScanner(bot, {}, worldMemory, {
    mcData,
    save: () => { saves++ },
    timestamp: () => '2026-07-05T12:00:00+02:00',
    dimension: () => 'overworld'
  })

  const result = await scanner.tick()

  assert.equal(result.changed, true)
  assert.equal(saves, 1)
  assert.equal(worldMemory.ores[0].block, 'iron_ore')
  assert.equal(worldMemory.dangerZones[0].block, 'lava')
  assert.equal(worldMemory.workstations[0].block, 'crafting_table')
  assert.equal(worldMemory.portals[0].block, 'nether_portal')
  assert.equal(worldMemory.oreChunks['overworld:1,0'].blocks.iron_ore, 1)
})

test('action executor turns unsafe failures into stable feedback reasons', async () => {
  const knowledge = {}
  const feedback = new FeedbackService({ knowledge })
  const executor = new ActionExecutor({
    feedbackService: feedback,
    actions: {
      mine_diamonds: async () => false
    },
    log: () => {}
  })

  await executor.execute({ action: 'mine_diamonds', goal: 'diamonds' }, {
    environment: { lavaNearby: true },
    dangerLevel: 3
  })

  assert.equal(knowledge.feedback.failures.lava_nearby, 1)
  assert.equal(knowledge.feedback.failureReasons.lava_nearby.actions.mine_diamonds, 1)
})

test('ranking penalizes repeated preparation failures', () => {
  const knowledge = {
    feedback: {
      actions: {
        mine_diamonds: { attempts: 3, successes: 0, failures: 3 }
      },
      recent: [
        { action: 'mine_diamonds', success: false },
        { action: 'mine_diamonds', success: false }
      ],
      failureReasons: {
        no_tool: { actions: { mine_diamonds: 2 } }
      }
    }
  }
  const ranking = new RankingService({ feedbackService: new FeedbackService({ knowledge }) })
  const ranked = ranking.rank({ action: 'mine_diamonds', priority: 80 }, {
    hasPickaxe: false,
    dangerLevel: 0,
    environment: {}
  })

  assert.ok(ranked.preparationPenalty >= 100)
  assert.ok(ranked.learnedPenalty > 20)
  assert.ok(ranked.score < 0)
})
