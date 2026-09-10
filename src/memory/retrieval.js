'use strict'
const { distance }=require('./worldMemory')
class Retrieval{
 constructor(store,registry){this.store=store;this.registry=registry}
 findRelevantSkills(goal,context={},limit=5){return this.registry.forGoal(goal).map(skill=>({skill,score:this.skillScore(skill,context)})).sort((a,b)=>b.score-a.score||a.skill.name.localeCompare(b.skill.name)).slice(0,limit)}
 skillScore(skill,context){const stats=this.store.data.skillStats[skill.name]||{};const requirements=this.registry.checkRequirements(skill,context).success?30:-100;return requirements+50*Number(stats.successRate||0)+5*Number(stats.recentSuccessStreak||0)-Number(stats.averageDurationMs||0)/60000}
 getBestSkillForGoal(goal,context){return this.findRelevantSkills(goal,context,1)[0]?.skill||null}
 findRelevantExperiences(task,context={},limit=5){return this.store.data.experiences.filter(x=>x.task===task&&(!context.worldId||!x.worldId||x.worldId===context.worldId)).map(x=>({value:x,score:(x.success?20:5)+(x.context?.dimension===context.dimension?10:0)+(x.context?.biome===context.biome?5:0)+Date.parse(x.createdAt)/1e13})).sort((a,b)=>b.score-a.score).slice(0,limit).map(x=>x.value)}
 findKnownLocations(type,position,worldId,limit=5){return this.store.data.worldLocations.filter(x=>x.type===type&&x.worldId===worldId&&Number(x.confidence||0)>0).map(x=>({value:x,score:100*Number(x.confidence||0)-distance(position,x.position)})).sort((a,b)=>b.score-a.score).slice(0,limit).map(x=>x.value)}
}
module.exports={Retrieval}
