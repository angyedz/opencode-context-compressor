'use strict';

const STATES=Object.freeze({RUNNING:'running',COMPACTING:'compacting',RESUME:'resume',STOPPED:'stopped',FAILED:'failed'});

function transition(state,event,meta={}){
 switch(state){
  case STATES.RUNNING:
   if(event==='overflow'||event==='pressure')return {state:STATES.COMPACTING,action:'compact'};
   if(event==='complete')return {state:STATES.STOPPED,action:'stop'};
   if(event==='fatal')return {state:STATES.FAILED,action:'propagate'};
   return {state,action:'continue'};
  case STATES.COMPACTING:
   if(event==='compaction-valid')return {state:STATES.RESUME,action:'inject-continuation'};
   if(event==='compaction-invalid')return {state:STATES.RUNNING,action:'rollback'};
   if(event==='fatal')return {state:STATES.FAILED,action:'propagate'};
   return {state,action:'wait'};
  case STATES.RESUME:
   if(event==='continuation-injected')return {state:STATES.RUNNING,action:'continue'};
   // Never reinterpret compaction model token usage as completion of the user's run.
   if(event==='overflow-accounting')return {state:STATES.RUNNING,action:'continue'};
   return {state,action:'inject-continuation'};
  default:return {state,action:'stop'};
 }
}

class ContinuityMachine{
 constructor(){this.sessions=new Map();}
 get(key){return this.sessions.get(String(key||'default'))||STATES.RUNNING;}
 send(key,event,meta={}){
  const k=String(key||'default'),next=transition(this.get(k),event,meta);this.sessions.set(k,next.state);return next;
 }
 reset(key){this.sessions.delete(String(key||'default'));}
}
module.exports={STATES,transition,ContinuityMachine};
