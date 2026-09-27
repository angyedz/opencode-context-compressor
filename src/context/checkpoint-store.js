'use strict';

const crypto=require('crypto');

function hash(value){return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,20);}
class CheckpointStore{
 constructor({maxPerSession=6}={}){this.maxPerSession=maxPerSession;this.sessions=new Map();}
 save(sessionKey,{messages=[],summary=null,workingSet=null,instructions=null,toolRegistry=null,epoch=0}={}){
  const key=String(sessionKey||'default');
  const checkpoint={id:crypto.randomBytes(8).toString('hex'),createdAt:Date.now(),epoch,messages:JSON.parse(JSON.stringify(messages)),summary,workingSet,instructions,toolRegistry};
  checkpoint.fingerprint=hash({epoch,messages:checkpoint.messages,summary});
  const list=this.sessions.get(key)||[];list.push(checkpoint);while(list.length>this.maxPerSession)list.shift();this.sessions.set(key,list);
  return {id:checkpoint.id,createdAt:checkpoint.createdAt,epoch,fingerprint:checkpoint.fingerprint};
 }
 latest(sessionKey){const list=this.sessions.get(String(sessionKey||'default'))||[];const x=list[list.length-1];return x?JSON.parse(JSON.stringify(x)):null;}
 fork(parentKey,childKey){
  const parent=this.latest(parentKey);if(!parent)return null;
  return this.save(childKey,{messages:parent.messages,summary:parent.summary,workingSet:parent.workingSet,instructions:parent.instructions,toolRegistry:parent.toolRegistry,epoch:parent.epoch});
 }
 restore(sessionKey,id=null){
  const list=this.sessions.get(String(sessionKey||'default'))||[];
  const x=id?list.find(c=>c.id===id):list[list.length-1];
  return x?JSON.parse(JSON.stringify(x)):null;
 }
 clear(sessionKey){this.sessions.delete(String(sessionKey||'default'));}
}
module.exports={hash,CheckpointStore};
