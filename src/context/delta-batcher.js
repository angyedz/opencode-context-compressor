'use strict';

class DeltaBatcher{
 constructor({maxItems=128,maxBytes=256*1024,flushMs=16}={}){this.maxItems=maxItems;this.maxBytes=maxBytes;this.flushMs=flushMs;this.queues=new Map();}
 add(key,delta){
  key=String(key);const q=this.queues.get(key)||{items:[],bytes:0,firstAt:Date.now()};
  const bytes=Buffer.byteLength(JSON.stringify(delta),'utf8');q.items.push(delta);q.bytes+=bytes;this.queues.set(key,q);
  return {flush:q.items.length>=this.maxItems||q.bytes>=this.maxBytes||Date.now()-q.firstAt>=this.flushMs,items:q.items.length,bytes:q.bytes};
 }
 take(key){
  key=String(key);const q=this.queues.get(key);if(!q)return [];
  this.queues.delete(key);return q.items;
 }
 clear(key){this.queues.delete(String(key));}
}
module.exports={DeltaBatcher};
