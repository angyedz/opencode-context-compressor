'use strict';

const EVENTS=Object.freeze({
 BEFORE:'before-compaction',AFTER:'after-compaction',ROLLBACK:'compaction-rollback',PRESSURE:'context-pressure',OVERFLOW:'context-overflow'
});
class HookBus{
 constructor({timeoutMs=2000}={}){this.timeoutMs=timeoutMs;this.handlers=new Map();}
 on(event,handler){if(!this.handlers.has(event))this.handlers.set(event,new Set());this.handlers.get(event).add(handler);return()=>this.off(event,handler);}
 off(event,handler){this.handlers.get(event)?.delete(handler);}
 async emit(event,payload){
  const results=[];
  for(const handler of this.handlers.get(event)||[]){
   try{
    const value=await Promise.race([
      Promise.resolve().then(()=>handler(payload)),
      new Promise((_,reject)=>setTimeout(()=>reject(Object.assign(new Error('hook timeout'),{code:'ERR_HOOK_TIMEOUT'})),this.timeoutMs)),
    ]);
    results.push({ok:true,value});
   }catch(error){results.push({ok:false,error:{message:error.message,code:error.code||null}});}
  }
  return results;
 }
 count(event){return this.handlers.get(event)?.size||0;}
}
module.exports={EVENTS,HookBus};
