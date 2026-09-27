'use strict';

const crypto=require('crypto');
function hash(v){return crypto.createHash('sha256').update(String(v||'')).digest('hex').slice(0,16);}
function normalizeQuery(q){return String(q||'').trim().replace(/\s+/g,' ').toLowerCase();}
class SearchResultCache{
 constructor({maxEntries=128,ttlMs=10*60*1000}={}){this.maxEntries=maxEntries;this.ttlMs=ttlMs;this.map=new Map();}
 key(kind,query,scope=''){return `${kind}:${normalizeQuery(query)}:${String(scope||'')}`;}
 set(kind,query,result,{scope='',revision=null}={}){
  const key=this.key(kind,query,scope);
  const entry={kind,query:normalizeQuery(query),scope,revision,hash:hash(result),result,createdAt:Date.now(),hits:0};
  this.map.delete(key);this.map.set(key,entry);while(this.map.size>this.maxEntries)this.map.delete(this.map.keys().next().value);return {...entry,result:undefined};
 }
 get(kind,query,{scope='',revision=null}={}){
  const key=this.key(kind,query,scope),e=this.map.get(key);if(!e)return null;
  if(Date.now()-e.createdAt>this.ttlMs||(revision!=null&&e.revision!=null&&revision!==e.revision)){this.map.delete(key);return null;}
  e.hits++;this.map.delete(key);this.map.set(key,e);return {...e};
 }
 reference(kind,query,options={}){const e=this.get(kind,query,options);return e?`[Cached ${kind} result sha256:${e.hash}; identical query already executed in this workspace revision]`:null;}
 invalidateScope(scope){for(const [k,e] of this.map)if(e.scope===scope)this.map.delete(k);}
 clear(){this.map.clear();}
}
module.exports={hash,normalizeQuery,SearchResultCache};
