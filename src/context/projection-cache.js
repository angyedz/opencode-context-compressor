'use strict';

class ProjectionCache{
 constructor({maxEntries=64,maxBytes=16*1024*1024}={}){this.maxEntries=maxEntries;this.maxBytes=maxBytes;this.map=new Map();this.bytes=0;}
 _size(v){try{return Buffer.byteLength(JSON.stringify(v),'utf8');}catch(_){return Infinity;}}
 get(key,sequence){const e=this.map.get(String(key));if(!e||e.sequence!==sequence)return null;this.map.delete(String(key));this.map.set(String(key),e);return e.value;}
 set(key,sequence,value){
  key=String(key);const old=this.map.get(key);if(old)this.bytes-=old.bytes;
  const bytes=this._size(value);if(bytes>this.maxBytes)return false;
  const e={sequence,value,bytes};this.map.delete(key);this.map.set(key,e);this.bytes+=bytes;
  while(this.map.size>this.maxEntries||this.bytes>this.maxBytes){const k=this.map.keys().next().value;const x=this.map.get(k);this.bytes-=x.bytes;this.map.delete(k);}
  return true;
 }
 invalidateAfter(sequence){for(const [k,e] of this.map)if(e.sequence>sequence){this.bytes-=e.bytes;this.map.delete(k);}}
 stats(){return {entries:this.map.size,bytes:this.bytes};}
}
module.exports={ProjectionCache};
