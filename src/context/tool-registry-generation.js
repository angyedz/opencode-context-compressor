'use strict';

class ToolRegistryGeneration{
 constructor(){this.servers=new Map();this.generation=0;}
 update(serverKey,{fingerprint,status='connected',tools=[]}={}){
  const key=String(serverKey),prev=this.servers.get(key);
  const changed=!prev||prev.fingerprint!==fingerprint||prev.status!==status;
  if(changed)this.generation++;
  const state={key,fingerprint,status,toolCount:tools.length,generation:this.generation,updatedAt:Date.now()};
  this.servers.set(key,state);return {changed,generation:this.generation,state};
 }
 remove(serverKey){const changed=this.servers.delete(String(serverKey));if(changed)this.generation++;return {changed,generation:this.generation};}
 cacheKey(agent,model){return `${agent||''}:${model||''}:tools-g${this.generation}`;}
 snapshot(){return {generation:this.generation,servers:[...this.servers.values()].map(x=>({...x}))};}
}
module.exports={ToolRegistryGeneration};
