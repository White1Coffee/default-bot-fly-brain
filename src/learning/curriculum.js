'use strict'
const DEFAULT_STEPS=['move_to_visible_block','collect_wood','craft_planks','craft_crafting_table','craft_wooden_pickaxe','collect_stone','craft_stone_pickaxe','craft_furnace','find_iron','mine_iron','smelt_iron','return_home_safely','store_items']
class Curriculum{
 constructor(stats,{enabled=true,minimumSuccesses=3,minimumSuccessRate=.7,steps=DEFAULT_STEPS}={}){this.stats=stats;this.enabled=enabled;this.minimumSuccesses=minimumSuccesses;this.minimumSuccessRate=minimumSuccessRate;this.steps=steps}
 unlocked(){if(!this.enabled)return[];const result=[];for(const name of this.steps){result.push(name);const s=this.stats[name];if(!s||s.successes<this.minimumSuccesses||Number(s.successRate)<this.minimumSuccessRate||this.critical(s))break}return result}
 next(){const unlocked=this.unlocked();return unlocked.find(name=>(this.stats[name]?.successes||0)<this.minimumSuccesses)||null}
 critical(s){return (s.lastErrorCodes||[]).slice(-3).length===3&&new Set((s.lastErrorCodes||[]).slice(-3)).size===1}
}
module.exports={Curriculum,DEFAULT_STEPS}
