'use strict'
class WorkingMemory {
  constructor(){this.reset()}
  reset(){this.value={currentTask:null,currentSubgoal:null,activeSkill:null,position:null,health:null,food:null,inventorySummary:{},nearbyHostiles:[],nearbyBlocks:[],attempt:0,lastError:null,skillStart:null}}
  update(patch={}){Object.assign(this.value,JSON.parse(JSON.stringify(patch)));return this.snapshot()}
  snapshot(){return JSON.parse(JSON.stringify(this.value))}
}
module.exports={WorkingMemory}
