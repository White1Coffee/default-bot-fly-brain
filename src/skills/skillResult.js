'use strict'
const { ErrorCodes, normalizeErrorCode } = require('../recovery/errorCodes')

function emptyMetrics(metrics = {}) {
  return { durationMs: 0, blocksTravelled: 0, damageTaken: 0, itemsGained: {}, ...metrics }
}
function success(data = {}, metrics = {}) {
  return { success: true, reason: null, recoverable: false, data, metrics: emptyMetrics(metrics) }
}
function failure(reason, recoverable = false, data = {}, metrics = {}) {
  return { success: false, reason: normalizeErrorCode(reason), recoverable: Boolean(recoverable), data, metrics: emptyMetrics(metrics) }
}
function normalize(result, durationMs = 0) {
  const normalized = result?.success === true
    ? success(result.data || {}, result.metrics)
    : failure(result?.reason || ErrorCodes.VALIDATION_FAILED, result?.recoverable, result?.data || {}, result?.metrics)
  normalized.metrics.durationMs = Number(result?.metrics?.durationMs ?? durationMs) || 0
  return normalized
}
module.exports = { success, failure, normalize, emptyMetrics }
