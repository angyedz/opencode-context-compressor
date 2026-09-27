'use strict';

const crypto=require('crypto');

function checksum(value){return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');}
class CompactionJournal{
 constructor({maxEntries=32,payloadAdapter=null}={}){this.maxEntries=maxEntries;this.payloadAdapter=payloadAdapter;this.sessions=new Map();}
 async append(sessionKey,{epoch=0,messages=[],reason='pressure',meta={}}={}){
  const key=String(sessionKey||'default');
  const id=crypto.randomBytes(10).toString('hex');
  const payload={messages};
  const entry={id,epoch,reason,createdAt:Date.now(),checksum:checksum(payload),messageCount:messages.length,meta:{...meta},payloadRef:null,payload:null};
  if(this.payloadAdapter?.save)entry.payloadRef=await this.payloadAdapter.save(key,id,payload);
  else entry.payload=payload;
  const list=this.sessions.get(key)||[];list.push(entry);while(list.length>this.maxEntries)list.shift();this.sessions.set(key,list);
  return {...entry,payload:undefined};
 }
 async restore(sessionKey,id=null){
  const list=this.sessions.get(String(sessionKey||'default'))||[];
  const entry=id?list.find(x=>x.id===id):list[list.length-1];if(!entry)return null;
  const payload=entry.payloadRef&&this.payloadAdapter?.load?await this.payloadAdapter.load(entry.payloadRef):entry.payload;
  if(!payload||checksum(payload)!==entry.checksum)throw Object.assign(new Error('Compaction journal checksum mismatch'),{code:'ERR_JOURNAL_CORRUPT'});
  return {entry:{...entry,payload:undefined},payload};
 }
 list(sessionKey){return (this.sessions.get(String(sessionKey||'default'))||[]).map(({payload,...x})=>({...x}));}
 clear(sessionKey){this.sessions.delete(String(sessionKey||'default'));}
}
module.exports={checksum,CompactionJournal};
