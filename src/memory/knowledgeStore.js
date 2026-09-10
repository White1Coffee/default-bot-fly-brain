'use strict'
const fs=require('fs');const path=require('path');const { writeJsonSafe,flushJsonWrites }=require('../runtime-storage')
const SCHEMA_VERSION=2
// Info: Learned knowledge heeft een eigen schema en krijgt vóór migratie automatisch een backup.
function defaults(){return {schemaVersion:SCHEMA_VERSION,experiences:[],skillStats:{},worldLocations:[],updatedAt:new Date(0).toISOString()}}
function migrate(value={}){const out={...defaults(),...(value&&typeof value==='object'?value:{})};out.schemaVersion=SCHEMA_VERSION;out.experiences=Array.isArray(out.experiences)?out.experiences.filter(x=>x&&typeof x==='object'):[];out.skillStats=out.skillStats&&typeof out.skillStats==='object'&&!Array.isArray(out.skillStats)?out.skillStats:{};out.worldLocations=Array.isArray(out.worldLocations)?out.worldLocations:[];return out}
class KnowledgeStore{
 constructor(file,options={}){this.file=file;this.log=options.log||console.warn;this.data=this.load()}
 load(){try{const raw=JSON.parse(fs.readFileSync(this.file,'utf8'));if(Number(raw?.schemaVersion||0)<SCHEMA_VERSION){const backupDir=path.join(path.dirname(path.dirname(this.file)),'knowledge-backups',`schema-v${Number(raw?.schemaVersion||0)}-${Date.now()}`);fs.mkdirSync(backupDir,{recursive:true});fs.copyFileSync(this.file,path.join(backupDir,path.basename(this.file)))}return migrate(raw)}catch(err){if(err.code!=='ENOENT')this.log(`Knowledge skipped (${path.basename(this.file)}): ${err.message}`);return defaults()}}
 // Info: writeJsonSafe combineert snelle saves en vervangt het JSON-bestand atomisch.
 save(){this.data.schemaVersion=SCHEMA_VERSION;this.data.updatedAt=new Date().toISOString();return writeJsonSafe(this.file,this.data)}
 async flush(){this.save();await flushJsonWrites()}
}
module.exports={KnowledgeStore,SCHEMA_VERSION,migrate,defaults}
