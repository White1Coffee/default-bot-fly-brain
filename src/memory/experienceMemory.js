'use strict'
class ExperienceMemory{
 constructor(store,options={}){this.store=store;this.windowMs=options.deduplicationWindowMs||3600000;this.maxRecords=options.maxRecords||2000}
 key(r){const c=r.context||{};return [r.task,r.skill,r.errorCode||'SUCCESS',c.dimension||'',c.biome||'',r.worldId||''].join('|')}
 record(value){const now=Date.parse(value.createdAt||'')||Date.now();const record={...value,createdAt:new Date(now).toISOString()};const duplicate=this.store.data.experiences.find(r=>this.key(r)===this.key(record)&&Math.abs(now-Date.parse(r.createdAt))<this.windowMs);if(duplicate){duplicate.occurrences=Number(duplicate.occurrences||1)+1;duplicate.lastSeenAt=record.createdAt;return {stored:false,record:duplicate}}this.store.data.experiences.push(record);this.store.data.experiences=this.store.data.experiences.slice(-this.maxRecords);this.store.save();return {stored:true,record}}
}
module.exports={ExperienceMemory}
