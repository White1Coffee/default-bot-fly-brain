'use strict'
const { resolveGoal }=require('./goalResolver')
class Planner{
 constructor(registry,retrieval){this.registry=registry;this.retrieval=retrieval}
 createPlan(goal,context={}){return resolveGoal(goal).filter(name=>this.registry.get(name)).filter(name=>!context.completedSkills?.includes(name)).map(name=>({skill:name,context:{goal},maxRetries:this.registry.get(name).maxRetries}))}
}
module.exports={Planner}
