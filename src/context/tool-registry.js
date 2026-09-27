'use strict';

const crypto=require('crypto');

function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object') return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
  return value;
}
function hash(value){
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0,20);
}
function toolName(tool){return tool?.function?.name||tool?.name||tool?.id||null;}
function compactTool(tool){
  const name=toolName(tool);
  const description=String(tool?.function?.description||tool?.description||'').replace(/\s+/g,' ').trim().slice(0,180);
  const schema=tool?.function?.parameters||tool?.inputSchema||tool?.input_schema||tool?.parameters||null;
  return {name,description,schemaHash:schema?hash(schema):null};
}
function buildRegistry(tools){
  const compact=(tools||[]).map(compactTool).filter(x=>x.name);
  return {fingerprint:hash(compact),count:compact.length,tools:compact};
}
function activeNames(messages){
  const names=new Set();
  for(const m of messages||[]){
    for(const call of m?.tool_calls||[]) if(call?.function?.name) names.add(call.function.name);
    if(m?.name) names.add(m.name);
    for(const p of Array.isArray(m?.content)?m.content:[]){
      if(p?.type==='tool_use'&&p.name) names.add(p.name);
      if(p?.functionCall?.name) names.add(p.functionCall.name);
      if(p?.functionResponse?.name) names.add(p.functionResponse.name);
    }
  }
  return names;
}
function selectActiveTools(tools,messages,{maxTools=32}={}){
  const active=activeNames(messages);
  const selected=[],rest=[];
  for(const tool of tools||[]){
    if(active.has(toolName(tool))&&selected.length<maxTools) selected.push(tool);
    else rest.push(tool);
  }
  return {selected,rest,active:[...active],registry:buildRegistry(tools)};
}
function continuitySignal(registry){
  if(!registry?.count) return null;
  return `[Tool registry] ${registry.count} tools remain registered; registry fingerprint ${registry.fingerprint}. Compaction must not be interpreted as tool unregistration.`;
}
module.exports={stable,hash,toolName,compactTool,buildRegistry,activeNames,selectActiveTools,continuitySignal};
