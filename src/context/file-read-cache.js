'use strict';

const crypto=require('crypto');

const DEFAULT_MAX_ENTRIES=256;
const DEFAULT_MAX_BYTES=8*1024*1024;

function normalizePath(value){
  return String(value||'').replace(/\\/g,'/').replace(/\/+/g,'/').trim();
}
function digest(content){
  return crypto.createHash('sha256').update(String(content??'')).digest('hex').slice(0,20);
}
function byteSize(content){return Buffer.byteLength(String(content??''),'utf8');}

class FileReadCache{
  constructor({maxEntries=DEFAULT_MAX_ENTRIES,maxBytes=DEFAULT_MAX_BYTES}={}){
    this.maxEntries=maxEntries;this.maxBytes=maxBytes;this.entries=new Map();this.bytes=0;
  }
  key(path){return normalizePath(path);}
  set(path,content,meta={}){
    const key=this.key(path);if(!key)return null;
    const old=this.entries.get(key);if(old)this.bytes-=old.bytes;
    const entry={path:key,digest:digest(content),bytes:byteSize(content),content:String(content??''),mtimeMs:Number(meta.mtimeMs)||null,version:meta.version??null,readAt:Date.now(),hits:0};
    this.entries.delete(key);this.entries.set(key,entry);this.bytes+=entry.bytes;this.prune();
    return {...entry,content:undefined};
  }
  get(path,meta={}){
    const key=this.key(path),entry=this.entries.get(key);if(!entry)return null;
    if(meta.mtimeMs!=null&&entry.mtimeMs!=null&&Number(meta.mtimeMs)!==entry.mtimeMs){this.delete(key);return null;}
    if(meta.version!=null&&entry.version!=null&&meta.version!==entry.version){this.delete(key);return null;}
    entry.hits++;this.entries.delete(key);this.entries.set(key,entry);
    return {...entry};
  }
  hasExact(path,content){const e=this.entries.get(this.key(path));return !!e&&e.digest===digest(content);}
  reference(path){
    const e=this.entries.get(this.key(path));if(!e)return null;
    return `[Cached file read: ${e.path} sha256:${e.digest} ${e.bytes}B; exact content already present in session working-set]`;
  }
  delete(path){const key=this.key(path),e=this.entries.get(key);if(e)this.bytes-=e.bytes;return this.entries.delete(key);}
  invalidate(path){return this.delete(path);}
  prune(){
    while(this.entries.size>this.maxEntries||this.bytes>this.maxBytes){
      const key=this.entries.keys().next().value;if(key===undefined)break;this.delete(key);
    }
  }
  stats(){return {entries:this.entries.size,bytes:this.bytes,hits:[...this.entries.values()].reduce((s,e)=>s+e.hits,0)};}
  clear(){this.entries.clear();this.bytes=0;}
}
module.exports={DEFAULT_MAX_ENTRIES,DEFAULT_MAX_BYTES,normalizePath,digest,byteSize,FileReadCache};
