'use strict';

const crypto=require('crypto');
function digest(value){return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,20);}
class ToolSchemaCache{
 constructor({ttlMs=60*60*1000,maxServers=64,adapter=null}={}){this.ttlMs=ttlMs;this.maxServers=maxServers;this.adapter=adapter;this.memory=new Map();}
 async set(serverKey,tools,{version=null}={}){
  const key=String(serverKey),entry={tools,version,fingerprint:digest(tools),createdAt:Date.now(),expiresAt:Date.now()+this.ttlMs};
  this.memory.delete(key);this.memory.set(key,entry);while(this.memory.size>this.maxServers)this.memory.delete(this.memory.keys().next().value);
  if(this.adapter?.save)await this.adapter.save(key,entry);return {...entry,tools:undefined};
 }
 async get(serverKey,{version=null}={}){
  const key=String(serverKey);let e=this.memory.get(key);
  if(!e&&this.adapter?.load){e=await this.adapter.load(key);if(e)this.memory.set(key,e);}
  if(!e)return null;
  if(Date.now()>e.expiresAt||(version!=null&&e.version!=null&&version!==e.version)){await this.invalidate(key);return null;}
  return e;
 }
 async invalidate(serverKey){const key=String(serverKey);this.memory.delete(key);if(this.adapter?.delete)await this.adapter.delete(key);}
 async fingerprint(serverKey){return (await this.get(serverKey))?.fingerprint||null;}
}
module.exports={digest,ToolSchemaCache};
