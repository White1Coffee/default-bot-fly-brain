'use strict'
const { EventEmitter } = require('events')
const { ErrorCodes, normalizeErrorCode } = require('../recovery/errorCodes')
const skillResult = require('../skills/skillResult')
const { withTimeout } = require('../utils/async')

const PRIORITY = Object.freeze({ EXPLORATION: 10, CURRICULUM: 20, PLAYER: 50, HOSTILE: 70, LOW_FOOD: 80, LOW_HEALTH: 90, ENVIRONMENT: 95, DANGER: 100 })
// Info: Deze manager bewaakt één actieve hoofdtaak en sorteert wachtende taken op prioriteit.
class TaskManager extends EventEmitter {
  constructor(options = {}) {
    super(); this.registry = options.registry; this.defaultTimeoutMs = options.taskTimeoutMs || 120000
    this.queue = []; this.active = null; this.sequence = 0; this.paused = false; this.closed = false
  }
  enqueue(task) {
    // Info: Een belangrijkere taak preëmpt de actieve taak via hetzelfde cancellation-signaal.
    if (this.closed) throw new Error('TaskManager is closed')
    const entry = { id: ++this.sequence, name: task.name || task.goal || 'task', goal: task.goal || task.name, source: task.source || 'system', priority: Number(task.priority || 0), plan: task.plan || [], context: task.context || {}, timeoutMs: task.timeoutMs || this.defaultTimeoutMs, createdAt: Date.now(), status: 'queued' }
    this.queue.push(entry); this.queue.sort((a,b) => b.priority-a.priority || a.id-b.id)
    if (this.active && entry.priority > this.active.priority) this.cancelActive(`preempted by ${entry.name}`)
    this.emit('status', this.status()); this._drain(); return entry
  }
  pause() { this.paused = true; this.emit('status', this.status()) }
  resume() { this.paused = false; this.emit('status', this.status()); this._drain() }
  cancelActive(reason = 'cancelled') { if (!this.active) return false; this.active.controller.abort(Object.assign(new Error(reason), { code: ErrorCodes.CANCELLED })); return true }
  cancelAll(reason = 'cancelled') { this.queue.splice(0).forEach(t => { t.status = 'cancelled' }); return this.cancelActive(reason) }
  async close(reason = 'shutdown') { this.closed = true; this.cancelAll(reason); if (this.runningPromise) await this.runningPromise.catch(() => {}) ; this.removeAllListeners() }
  status() { const a=this.active; return { currentTask:a?.name||null,currentStep:a?.currentStep||null,activeSkill:a?.activeSkill||null,attempt:a?.attempt||0,maxAttempts:a?.maxAttempts||0,lastError:a?.lastError||null,currentPlan:a?.plan?.map(s=>typeof s==='string'?s:s.skill)||[],queueLength:this.queue.length,paused:this.paused } }
  _drain() { if (this.closed || this.paused || this.active || !this.queue.length) return; const task=this.queue.shift(); this.runningPromise=this._run(task).finally(()=>{this.runningPromise=null;this._drain()}) }
  async _run(task) {
    task.status='running'; task.controller=new AbortController(); task.startedAt=Date.now(); this.active=task; this.emit('status',this.status())
    try {
      task.result = await withTimeout(signal => this._runPlan(task, signal), task.timeoutMs, task.controller.signal)
      task.status = task.result.success ? 'success' : 'failed'
    } catch(err) { task.result=skillResult.failure(normalizeErrorCode(err?.code, ErrorCodes.UNKNOWN), err?.code!==ErrorCodes.CANCELLED); task.status=err?.code===ErrorCodes.CANCELLED?'cancelled':'failed' }
    finally { task.finishedAt=Date.now(); this.emit('complete',task); if(this.active===task)this.active=null; this.emit('status',this.status()) }
    return task.result
  }
  async _runPlan(task, signal) {
    // Info: Skills worden stap voor stap uitgevoerd, gevalideerd en maximaal drie keer geprobeerd.
    let finalResult=skillResult.success()
    for (const step of task.plan) {
      const spec=typeof step==='string'?{skill:step}:step; const skill=this.registry?.get(spec.skill)
      if(!skill) return skillResult.failure(ErrorCodes.VALIDATION_FAILED,false,{missingSkill:spec.skill})
      const requirements=this.registry.checkRequirements(skill,{...task.context,...spec.context})
      if(!requirements.success)return requirements
      task.currentStep=spec.skill;task.activeSkill=spec.skill;task.maxAttempts=Math.min(3,Number(spec.maxRetries||skill.maxRetries||1));let previousFingerprint=null,stepResult=null
      for(let attempt=1;attempt<=task.maxAttempts;attempt++){
        task.attempt=attempt;this.emit('status',this.status())
        const context={...task.context,...spec.context,attempt,previousResult:task.lastResult,signal}
        const fingerprint=JSON.stringify(spec.recovery?.(context) ?? context.approach ?? attempt)
        if(attempt>1 && fingerprint===previousFingerprint)return skillResult.failure(ErrorCodes.VALIDATION_FAILED,false,{reason:'UNCHANGED_RETRY'})
        previousFingerprint=fingerprint
        const started=Date.now()
        try {
          const raw=await withTimeout(s=>skill.execute({...context,signal:s}),spec.timeoutMs||skill.timeoutMs,signal)
          const execution=skillResult.normalize(raw,Date.now()-started)
          const validation=execution.success?await skill.validate({...context,result:execution}):execution
          const normalized=validation?.success===true?execution:skillResult.normalize(validation,Date.now()-started)
          task.lastResult=normalized;task.lastError=normalized.reason
          // Info: Een geslaagde skill voltooit alleen deze planstap; de volgende skill moet daarna ook echt draaien.
          if(normalized.success){stepResult=normalized;break}
          if(!normalized.recoverable)break
        } catch(err){task.lastResult=skillResult.failure(normalizeErrorCode(err?.code),err?.code!==ErrorCodes.CANCELLED);task.lastError=task.lastResult.reason;if(err?.code===ErrorCodes.CANCELLED)throw err}
      }
      stepResult=stepResult||task.lastResult||skillResult.failure(ErrorCodes.VALIDATION_FAILED)
      if(!stepResult.success)return stepResult
      finalResult=stepResult
    }
    return finalResult
  }
}
module.exports = { TaskManager, PRIORITY }
