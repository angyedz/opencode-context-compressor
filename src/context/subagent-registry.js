'use strict';

class SubagentRegistry{
 constructor({maxChildren=64}={}){this.maxChildren=maxChildren;this.parents=new Map();}
 register(parentKey,{sessionId,agent,status='running',metadata={}}){
  const key=String(parentKey||'default'),list=this.parents.get(key)||[];
  const existing=list.find(x=>x.sessionId===sessionId);
  if(existing)Object.assign(existing,{agent,status,metadata,updatedAt:Date.now()});
  else list.push({sessionId,agent,status,metadata,createdAt:Date.now(),updatedAt:Date.now()});
  while(list.length>this.maxChildren)list.shift();this.parents.set(key,list);
  return this.get(parentKey,sessionId);
 }
 complete(parentKey,sessionId,result){
  const child=this.get(parentKey,sessionId);if(!child)return null;
  child.status='completed';child.result=result;child.updatedAt=Date.now();child.delivered=false;return child;
 }
 pendingCompletions(parentKey){
  return (this.parents.get(String(parentKey||'default'))||[]).filter(x=>x.status==='completed'&&!x.delivered);
 }
 acknowledge(parentKey,sessionId){const c=this.get(parentKey,sessionId);if(c)c.delivered=true;return !!c;}
 get(parentKey,sessionId){return (this.parents.get(String(parentKey||'default'))||[]).find(x=>x.sessionId===sessionId)||null;}
 resume(parentKey,sessionId){const c=this.get(parentKey,sessionId);return c?{sessionId:c.sessionId,agent:c.agent,status:c.status,metadata:c.metadata}:null;}
}
module.exports={SubagentRegistry};
