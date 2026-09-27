'use strict';

const crypto=require('crypto');
function hash(value){return crypto.createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');}
function isOpaquePart(part){
 if(!part||typeof part!=='object')return false;
 return ['image','image_url','file','attachment','audio','video'].includes(part.type)||
   part.image_url!=null||part.inlineData!=null||part.fileData!=null||part.data?.startsWith?.('data:');
}
class StructuredPayloadVault{
 constructor({maxEntries=128,maxBytes=64*1024*1024}={}){this.maxEntries=maxEntries;this.maxBytes=maxBytes;this.map=new Map();this.bytes=0;}
 put(part){
  const serialized=JSON.stringify(part),id=hash(serialized),bytes=Buffer.byteLength(serialized,'utf8');
  if(!this.map.has(id)){this.map.set(id,{part:JSON.parse(serialized),bytes,createdAt:Date.now()});this.bytes+=bytes;this.prune();}
  return {type:'context_payload_ref',id,originalType:part.type||'structured',bytes};
 }
 get(ref){const e=this.map.get(ref?.id);return e?JSON.parse(JSON.stringify(e.part)):null;}
 prune(){while(this.map.size>this.maxEntries||this.bytes>this.maxBytes){const k=this.map.keys().next().value,e=this.map.get(k);this.bytes-=e.bytes;this.map.delete(k);}}
 stats(){return {entries:this.map.size,bytes:this.bytes};}
}
function externalize(content,vault){
 if(!Array.isArray(content))return content;
 return content.map(part=>isOpaquePart(part)?vault.put(part):part);
}
function hydrate(content,vault){
 if(!Array.isArray(content))return content;
 return content.map(part=>part?.type==='context_payload_ref'?(vault.get(part)||part):part);
}
module.exports={hash,isOpaquePart,StructuredPayloadVault,externalize,hydrate};
