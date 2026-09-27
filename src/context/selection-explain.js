'use strict';

const relevance=require('./relevance-engine');

function truncate(text,limit=180){
  const value=String(text||'').replace(/\s+/g,' ').trim();
  return value.length<=limit?value:value.slice(0,Math.max(0,limit-1))+'…';
}

function publicSelection(records,{limit=6,includeFacts=true}={}){
  return (records||[]).slice(0,limit).map((record,index)=>({
    rank:index+1,
    ...(includeFacts?{fact:truncate(record.fact)}:{}),
    score:Number(record.score||0),
    sourceRole:record.sourceRole||record.role||'unknown',
    lifecycle:record.lifecycle||'neutral',
    entities:(record.entities||[]).slice(0,4),
    reasons:relevance.summarizeReasons(record),
  }));
}

function renderSelection(records,{limit=6}={}){
  const selected=publicSelection(records,{limit,includeFacts:true});
  if(!selected.length) return 'No ranked historical anchors were selected.';
  return [
    '🎯 **Top context anchors**',
    ...selected.map(item=>{
      const meta=[
        `score=${item.score}`,
        `source=${item.sourceRole}`,
        item.lifecycle!== 'neutral' ? `state=${item.lifecycle}` : null,
        item.reasons||null,
      ].filter(Boolean).join('; ');
      return `${item.rank}. ${item.fact}\n   ↳ ${meta}`;
    }),
  ].join('\n');
}

module.exports={truncate,publicSelection,renderSelection};
