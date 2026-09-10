'use strict'
const { success,failure }=require('./skillResult');const { ErrorCodes }=require('../recovery/errorCodes')
const DEFINITIONS=[
 ['ensureSafety',['survive'],15000],['findFood',['survive'],90000],['eat',['survive'],10000],['goToLocation',['go_to_location','return_home'],120000],
 ['collectWood',['collect_wood'],90000],['craftPlanks',['craft_planks','craft_crafting_table','craft_pickaxe'],20000],['craftCraftingTable',['craft_crafting_table','craft_pickaxe'],25000],
 ['craftTool',['craft_pickaxe','obtain_iron_ingot'],30000],['collectStone',['collect_stone','obtain_iron_ingot'],90000],['craftFurnace',['obtain_iron_ingot'],30000],
 ['mineResource',['obtain_iron_ingot'],180000],['smeltItem',['obtain_iron_ingot'],180000],['returnHome',['return_home'],120000],['storeItems',['store_items'],60000]
]
// Info: Alleen geregistreerde high-level skills zijn uitvoerbaar; knowledge kan geen losse code injecteren.
function registerVerticalSkills(registry,adapters={}){for(const [name,goals,timeoutMs] of DEFINITIONS)registry.register({name,description:`Deterministic high-level ${name} action`,goals,requirements:[],timeoutMs,maxRetries:3,version:1,async execute(context){const fn=adapters[name];if(!fn)return failure(ErrorCodes.VALIDATION_FAILED,false,{missingAdapter:name});const value=await fn(context);if(value?.success!==undefined)return value;return value?success():failure(errorFor(name),true)},async validate(context){const validate=adapters[`${name}Validate`];return validate?validate(context):context.result}});return registry}
function errorFor(name){if(name.includes('craft')||name==='craftTool')return ErrorCodes.CRAFT_FAILED;if(name==='smeltItem')return ErrorCodes.SMELT_FAILED;if(name.includes('Location')||name==='returnHome')return ErrorCodes.PATH_FAILED;if(name==='findFood'||name==='eat')return ErrorCodes.NO_FOOD;return ErrorCodes.TARGET_MISSING}
module.exports={registerVerticalSkills,DEFINITIONS}
