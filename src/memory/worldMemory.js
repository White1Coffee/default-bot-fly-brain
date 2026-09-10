'use strict'
class WorldMemory{
 constructor(store,{dedupeDistance=8}={}){this.store=store;this.dedupeDistance=dedupeDistance}
 remember(location){if(!location?.type||!location?.worldId||!location?.dimension||!location?.position)return null;const now=new Date().toISOString();const same=this.store.data.worldLocations.find(x=>x.type===location.type&&x.worldId===location.worldId&&x.dimension===location.dimension&&distance(x.position,location.position)<=this.dedupeDistance);if(same){Object.assign(same,location,{lastConfirmed:now,confidence:Math.min(1,Number(same.confidence||0.5)+0.1)});this.store.save();return same}const value={confidence:0.6,lastVisited:null,lastConfirmed:now,...location};this.store.data.worldLocations.push(value);this.store.save();return value}
 invalidate(location,amount=.25){location.confidence=Math.max(0,Number(location.confidence||0)-amount);location.invalidatedAt=new Date().toISOString();this.store.save()}
}
function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)}
module.exports={WorldMemory,distance}
