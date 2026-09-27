'use strict';

const {estimateTokens}=require('./token-budget');
const {toolName,buildRegistry,activeNames}=require('./tool-registry');

function words(text){return new Set((String(text||'').toLowerCase().match(/[a-z0-9_.:/-]{3,}/g)||[]));}
function toolText(tool){
  const fn=tool?.function||tool||{};
  return [toolName(tool),fn.description||tool?.description||'',JSON.stringify(fn.parameters||tool?.inputSchema||tool?.input_schema||{})].join(' ');
}
function schemaCost(tool){return estimateTokens(tool);}
function relevance(tool,query){
  const q=words(query),t=words(toolText(tool));let overlap=0;
  for(const w of q) if(t.has(w)) overlap++;
  const name=String(toolName(tool)||'').toLowerCase();
  let nameBonus=0;for(const w of q) if(name.includes(w)||w.includes(name)) nameBonus=Math.max(nameBonus,4);
  return overlap+nameBonus;
}
function select(tools,messages,query,{budgetTokens=8000,minTools=8,maxTools=64}={}){
  const active=activeNames(messages);
  const ranked=(tools||[]).map((tool,index)=>({
    tool,index,name:toolName(tool),cost:schemaCost(tool),score:relevance(tool,query),active:active.has(toolName(tool)),
  })).sort((a,b)=>Number(b.active)-Number(a.active)||b.score-a.score||a.cost-b.cost||a.index-b.index);
  const selected=[];let used=0;
  for(const row of ranked){
    const required=row.active||selected.length<minTools;
    if(!required&&(selected.length>=maxTools||used+row.cost>budgetTokens)) continue;
    selected.push(row);used+=row.cost;
  }
  const selectedNames=new Set(selected.map(x=>x.name));
  return {
    tools:selected.map(x=>x.tool),
    omitted:ranked.filter(x=>!selectedNames.has(x.name)).map(x=>x.name),
    usedTokens:used,
    budgetTokens,
    registry:buildRegistry(tools),
    scores:selected.map(x=>({name:x.name,cost:x.cost,score:x.score,active:x.active})),
  };
}
module.exports={words,toolText,schemaCost,relevance,select};
