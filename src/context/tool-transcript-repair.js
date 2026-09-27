'use strict';

/**
 * Repairs provider-invalid tool transcripts caused by interrupted/aborted runs.
 * Prefer completed results over aborted/unknown duplicates sharing the same call id.
 */

function contentText(content){
  if(typeof content==='string') return content;
  try{return JSON.stringify(content);}catch(_){return String(content||'');}
}

function quality(message){
  const text=contentText(message?.content).toLowerCase();
  let score=0;
  if(/completed|success|passed|result/.test(text)) score+=4;
  if(/aborted|interrupted|cancelled|canceled|unknown/.test(text)) score-=5;
  if(message?.role==='tool') score+=2;
  return score;
}

function repairOpenAI(messages){
  const best=new Map();
  for(let i=0;i<(messages||[]).length;i++){
    const m=messages[i];
    if(m?.role!=='tool'||!m.tool_call_id) continue;
    const current=best.get(m.tool_call_id);
    const candidate={index:i,score:quality(m)};
    if(!current||candidate.score>current.score||(candidate.score===current.score&&i>current.index)) best.set(m.tool_call_id,candidate);
  }
  const removed=[];
  const output=(messages||[]).filter((m,i)=>{
    if(m?.role!=='tool'||!m.tool_call_id) return true;
    const keep=best.get(m.tool_call_id)?.index===i;
    if(!keep) removed.push({provider:'openai',callId:m.tool_call_id,index:i});
    return keep;
  });
  return {messages:output,removed};
}

function repairAnthropic(messages){
  const seen=new Map(),removeParts=new Map(),removed=[];
  for(let mi=0;mi<(messages||[]).length;mi++){
    const content=messages[mi]?.content;
    if(!Array.isArray(content)) continue;
    for(let pi=0;pi<content.length;pi++){
      const part=content[pi];
      if(part?.type!=='tool_result'||!part.tool_use_id) continue;
      const key=part.tool_use_id;
      const score=quality({content:part.content});
      const old=seen.get(key);
      if(!old||score>old.score||(score===old.score&&mi>old.mi)){
        if(old){
          if(!removeParts.has(old.mi)) removeParts.set(old.mi,new Set());
          removeParts.get(old.mi).add(old.pi);
          removed.push({provider:'anthropic',callId:key,message:old.mi,part:old.pi});
        }
        seen.set(key,{mi,pi,score});
      }else{
        if(!removeParts.has(mi)) removeParts.set(mi,new Set());
        removeParts.get(mi).add(pi);
        removed.push({provider:'anthropic',callId:key,message:mi,part:pi});
      }
    }
  }
  const output=(messages||[]).map((m,mi)=>{
    if(!removeParts.has(mi)||!Array.isArray(m.content)) return m;
    return {...m,content:m.content.filter((_,pi)=>!removeParts.get(mi).has(pi))};
  }).filter(m=>!Array.isArray(m.content)||m.content.length>0);
  return {messages:output,removed};
}

function repair(messages){
  const a=repairOpenAI(messages);
  const b=repairAnthropic(a.messages);
  return {messages:b.messages,removed:[...a.removed,...b.removed],repaired:a.removed.length+b.removed.length};
}

module.exports={contentText,quality,repairOpenAI,repairAnthropic,repair};
