const test = require('node:test')
const assert = require('node:assert/strict')
const { TaskController } = require('../src/task-controller')

test('starting a new task cancels the previous token', () => {
  const controller = new TaskController()
  const first = controller.begin('first')
  const second = controller.begin('second')
  assert.equal(first.cancelled, true)
  assert.equal(controller.isActive(first), false)
  assert.equal(controller.isActive(second), true)
})

test('cancelIfActive cannot cancel a replacement task with an old token', () => {
  const controller = new TaskController()
  const first = controller.begin('first')
  const second = controller.begin('second')
  assert.equal(controller.cancelIfActive(first), false)
  assert.equal(controller.isActive(second), true)
  assert.equal(controller.cancelIfActive(second), true)
  assert.equal(controller.active, null)
})
