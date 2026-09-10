'use strict'
function goalDistance(bot){const p=bot.position,d=bot.destination;if(!p||!d)return Infinity;return Math.hypot(p.x-d.x,p.y-d.y,p.z-d.z)}
function rankBotsForPassage(bots=[]){return [...bots].sort((a,b)=>Number(b.priority||0)-Number(a.priority||0)||Number(Boolean(b.hasObjectReservation))-Number(Boolean(a.hasObjectReservation))||goalDistance(a)-goalDistance(b)||String(a.botId).localeCompare(String(b.botId)))}
function shouldYield(self,peers){return rankBotsForPassage([self,...peers])[0]?.botId!==self.botId}
module.exports={rankBotsForPassage,shouldYield,goalDistance}
