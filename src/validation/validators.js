'use strict'
const { ErrorCodes } = require('../recovery/errorCodes')
const ok = details => ({ success: true, reason: null, expected: null, actual: null, details: details || {} })
const fail = (reason, expected, actual, details = {}) => ({ success: false, reason, expected, actual, details })
function countItem(bot, name) { return (bot?.inventory?.items?.() || []).filter(i => i.name === name).reduce((n,i)=>n+Number(i.count||0),0) }
function itemDelta(bot, name, before, amount=1) { const actual=countItem(bot,name); const expected=Number(before)+Number(amount); return actual>=expected?ok({item:name}):fail(ErrorCodes.INSUFFICIENT_ITEMS,expected,actual,{item:name}) }
function destination(bot, target, tolerance=2) {
  const position=bot?.entity?.position; const dimension=bot?.game?.dimension || bot?.dimension
  if(!position || !target)return fail(ErrorCodes.TARGET_MISSING,target,null)
  if(target.dimension && dimension && target.dimension!==dimension)return fail(ErrorCodes.VALIDATION_FAILED,target.dimension,dimension,{field:'dimension'})
  const distance=typeof position.distanceTo==='function'?position.distanceTo(target):Math.hypot(position.x-target.x,position.y-target.y,position.z-target.z)
  return distance<=tolerance?ok({distance}):fail(ErrorCodes.PATH_FAILED,`<=${tolerance}`,distance)
}
function inventoryTransition(bot, changes={}) { for(const [name,range] of Object.entries(changes)){const actual=countItem(bot,name);if(range.min!=null&&actual<range.min)return fail(ErrorCodes.INSUFFICIENT_ITEMS,range.min,actual,{item:name});if(range.max!=null&&actual>range.max)return fail(ErrorCodes.VALIDATION_FAILED,range.max,actual,{item:name})}return ok() }
function stored(beforeInventory, afterInventory, beforeContainer, afterContainer, name, amount=1) { const removed=(beforeInventory[name]||0)-(afterInventory[name]||0),added=(afterContainer[name]||0)-(beforeContainer[name]||0);return removed>=amount&&added>=amount?ok({removed,added}):fail(ErrorCodes.VALIDATION_FAILED,amount,Math.min(removed,added),{removed,added,item:name}) }
module.exports={countItem,itemDelta,destination,inventoryTransition,stored,ok,fail}
