'use strict'
const crypto=require('crypto')
function worldIdentity({host='localhost',port=25565,version='unknown',worldName='default',seed}={}){const server=`${String(host).toLowerCase()}:${Number(port)||25565}`;const raw=[server,version,worldName,seed??''].join('|');return {serverId:crypto.createHash('sha256').update(server).digest('hex').slice(0,16),worldId:crypto.createHash('sha256').update(raw).digest('hex').slice(0,24),host:String(host),port:Number(port),version:String(version),worldName:String(worldName)}}
module.exports={worldIdentity}
