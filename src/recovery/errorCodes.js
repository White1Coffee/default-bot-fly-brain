'use strict'

const ErrorCodes = Object.freeze({
  NO_TOOL: 'NO_TOOL', NO_FOOD: 'NO_FOOD', LOW_HEALTH: 'LOW_HEALTH',
  PATH_FAILED: 'PATH_FAILED', PATH_STUCK: 'PATH_STUCK', TARGET_MISSING: 'TARGET_MISSING',
  TARGET_UNREACHABLE: 'TARGET_UNREACHABLE', INVENTORY_FULL: 'INVENTORY_FULL',
  CRAFT_FAILED: 'CRAFT_FAILED', SMELT_FAILED: 'SMELT_FAILED', VALIDATION_FAILED: 'VALIDATION_FAILED',
  INSUFFICIENT_ITEMS: 'INSUFFICIENT_ITEMS', TIMEOUT: 'TIMEOUT', CANCELLED: 'CANCELLED',
  UNSAFE_ENVIRONMENT: 'UNSAFE_ENVIRONMENT', BOT_DISCONNECTED: 'BOT_DISCONNECTED',
  REQUIREMENTS_NOT_MET: 'REQUIREMENTS_NOT_MET', UNKNOWN: 'UNKNOWN'
})

const known = new Set(Object.values(ErrorCodes))
function normalizeErrorCode(value, fallback = ErrorCodes.UNKNOWN) {
  const code = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_')
  return known.has(code) ? code : fallback
}

module.exports = { ErrorCodes, normalizeErrorCode }
