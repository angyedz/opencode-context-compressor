'use strict';

class SessionLeaseTable{
 constructor({ttlMs=30000}={}){this.ttlMs=ttlMs;this.leases=new Map();}
 acquire(sessionId,owner,{workspace=null}={}){
  const key=String(sessionId),now=Date.now(),current=this.leases.get(key);
  if(current&&current.owner!==owner&&now-current.heartbeatAt<this.ttlMs)return {ok:false,reason:'in-use',lease:{...current}};
  const lease={sessionId:key,owner:String(owner),workspace,acquiredAt:current?.owner===owner?current.acquiredAt:now,heartbeatAt:now};
  this.leases.set(key,lease);return {ok:true,lease:{...lease}};
 }
 heartbeat(sessionId,owner){const l=this.leases.get(String(sessionId));if(!l||l.owner!==String(owner))return false;l.heartbeatAt=Date.now();return true;}
 release(sessionId,owner){const key=String(sessionId),l=this.leases.get(key);if(!l||l.owner!==String(owner))return false;this.leases.delete(key);return true;}
 isLive(sessionId){const l=this.leases.get(String(sessionId));return !!l&&Date.now()-l.heartbeatAt<this.ttlMs;}
}
function chooseContinuation(sessions,{workspace=null,leases=null,owner=null}={}){
 const candidates=(sessions||[]).filter(s=>!s.parentID&&!s.parentId);
 const exact=workspace?candidates.filter(s=>(s.workspaceID||s.workspaceId||s.directory)===workspace):candidates;
 const free=exact.filter(s=>!leases?.isLive(s.id)||leases?.leases?.get(String(s.id))?.owner===String(owner));
 return free.sort((a,b)=>Number(b.time_updated||b.updatedAt||0)-Number(a.time_updated||a.updatedAt||0))[0]||null;
}
module.exports={SessionLeaseTable,chooseContinuation};
