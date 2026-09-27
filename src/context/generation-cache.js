'use strict';

class GenerationCache{
 constructor(){this.sessions=new Map();}
 _state(key){
  key=String(key||'default');
  let s=this.sessions.get(key);
  if(!s){s={generation:0,messages:null,tools:null,summary:null,keys:{}};this.sessions.set(key,s);}
  return s;
 }
 generation(key){return this._state(key).generation;}
 get(key,kind,cacheKey=null){
  const s=this._state(key),e=s[kind];if(!e)return null;
  if(e.generation!==s.generation)return null;
  if(cacheKey!=null&&e.cacheKey!==String(cacheKey))return null;
  return e.value;
 }
 set(key,kind,value,cacheKey=null){
  const s=this._state(key);s[kind]={generation:s.generation,cacheKey:cacheKey==null?null:String(cacheKey),value};return value;
 }
 invalidate(key,reason='unknown'){
  const s=this._state(key);s.generation++;s.messages=s.tools=s.summary=null;s.lastInvalidation={reason,at:Date.now()};return s.generation;
 }
 invalidateKind(key,kind,reason='unknown'){
  const s=this._state(key);s[kind]=null;s.lastInvalidation={reason,kind,at:Date.now()};return s.generation;
 }
 stats(key){const s=this._state(key);return {generation:s.generation,messages:!!s.messages,tools:!!s.tools,summary:!!s.summary,lastInvalidation:s.lastInvalidation||null};}
}
module.exports={GenerationCache};
