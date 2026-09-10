'use strict'
const GOALS={
 survive:['ensureSafety','findFood','eat'],
 go_to_location:['ensureSafety','goToLocation'],
 collect_wood:['ensureSafety','collectWood'],
 craft_planks:['craftPlanks'],craft_crafting_table:['craftPlanks','craftCraftingTable'],
 craft_pickaxe:['craftPlanks','craftCraftingTable','craftTool'],collect_stone:['ensureSafety','collectStone'],
 obtain_iron_ingot:['ensureSafety','findFood','eat','craftTool','collectStone','craftFurnace','mineResource','smeltItem'],
 return_home:['ensureSafety','returnHome'],store_items:['ensureSafety','storeItems']
}
function resolveGoal(goal){return [...(GOALS[goal]||[])]}
module.exports={resolveGoal,GOALS}
