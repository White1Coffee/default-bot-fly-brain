'use strict'
const { ErrorCodes } = require('../recovery/errorCodes')

class TaskAbortError extends Error { constructor(code, message = code) { super(message); this.name = 'TaskAbortError'; this.code = code } }
function throwIfAborted(signal) { if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new TaskAbortError(ErrorCodes.CANCELLED) }
function withTimeout(operation, timeoutMs, parentSignal) {
  const controller = new AbortController()
  const abortFromParent = () => controller.abort(parentSignal.reason || new TaskAbortError(ErrorCodes.CANCELLED))
  if (parentSignal?.aborted) abortFromParent()
  else parentSignal?.addEventListener('abort', abortFromParent, { once: true })
  const timer = setTimeout(() => controller.abort(new TaskAbortError(ErrorCodes.TIMEOUT)), Math.max(1, Number(timeoutMs) || 1))
  return Promise.race([
    Promise.resolve().then(() => operation(controller.signal)),
    new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true }))
  ]).finally(() => { clearTimeout(timer); parentSignal?.removeEventListener('abort', abortFromParent) })
}
module.exports = { TaskAbortError, throwIfAborted, withTimeout }
