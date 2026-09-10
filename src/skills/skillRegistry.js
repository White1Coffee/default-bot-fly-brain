'use strict'
const { ErrorCodes } = require('../recovery/errorCodes')
const result = require('./skillResult')

class SkillRegistry {
  constructor() { this.skills = new Map() }
  register(skill) {
    if (!skill || typeof skill.name !== 'string' || !skill.name.trim()) throw new TypeError('Skill name is required')
    if (typeof skill.execute !== 'function' || typeof skill.validate !== 'function') throw new TypeError(`Skill ${skill.name} requires execute and validate`)
    if (this.skills.has(skill.name)) throw new Error(`Skill already registered: ${skill.name}`)
    const value = Object.freeze({ description: '', goals: [], requirements: [], timeoutMs: 60000, maxRetries: 3, version: 1, ...skill, name: skill.name.trim() })
    this.skills.set(value.name, value)
    return value
  }
  get(name) { return this.skills.get(name) || null }
  list() { return [...this.skills.values()] }
  forGoal(goal) { return this.list().filter(skill => skill.goals.includes(goal)) }
  checkRequirements(skill, context = {}) {
    const missing = (skill.requirements || []).filter(requirement => {
      if (typeof requirement === 'function') return !requirement(context)
      return !context.requirements?.includes(requirement) && !context.inventorySummary?.[requirement]
    })
    return missing.length ? result.failure(ErrorCodes.REQUIREMENTS_NOT_MET, true, { missing }) : result.success()
  }
}
module.exports = { SkillRegistry }
