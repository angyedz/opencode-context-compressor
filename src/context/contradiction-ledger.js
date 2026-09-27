'use strict';

const { factEntities }=require('./semantic-graph');

function normalize(text){
  return String(text||'').toLowerCase().replace(/\s+/g,' ').trim();
}

function lifecycle(text){
  const lower=normalize(text);
  if(/\b(pass(?:ed)?|fixed|resolved|completed|done|green|succeeded|success|closed)\b/.test(lower)) return 'resolved';
  if(/\b(error|failed|failure|broken|regression|blocked|todo|fixme|remaining|pending)\b/.test(lower)) return 'open';
  return 'neutral';
}

function topicKey(fact){
  const entities=factEntities(fact);
  if(entities.length) return entities.slice(0,3).join('|');
  return normalize(fact)
    .replace(/\b\d+(?:\.\d+)*\b/g,'<n>')
    .replace(/\b(?:changed|updated|set|use|using|must|should|decision|decided|resolved|fixed|failed|error)\b/g,'')
    .replace(/\s+/g,' ')
    .trim()
    .slice(0,180);
}

function valueSignature(fact){
  const text=normalize(fact);
  const assignments=[...text.matchAll(/\b(port|ttl|timeout|limit|budget|version)\s*(?:=|:|is|must be|should be)?\s*([0-9]+(?:\.[0-9]+)*[a-z]*)\b/g)];
  if(assignments.length) return assignments.map(m=>`${m[1]}=${m[2]}`).join('|');
  const quoted=[...text.matchAll(/["'`]([^"'\`]{1,80})["'`]/g)].map(m=>m[1]);
  if(quoted.length) return quoted.slice(0,3).join('|');
  return text
    .replace(/\b(?:decision|decided|must|should|require|required|resolved|fixed|error|failed)\b/g,'')
    .replace(/\s+/g,' ')
    .slice(0,220);
}

function resolveRecords(records){
  const groups=new Map();
  for(const record of records||[]){
    const topic=record.topic||topicKey(record.fact);
    if(!groups.has(topic)) groups.set(topic,[]);
    groups.get(topic).push({...record,topic,lifecycle:record.lifecycle||lifecycle(record.fact),valueSignature:valueSignature(record.fact)});
  }

  const active=[];
  const superseded=[];
  const conflicts=[];

  for(const [topic,items] of groups){
    items.sort((a,b)=>(a.recency??Infinity)-(b.recency??Infinity)||(b.score||0)-(a.score||0));
    const newest=items[0];
    active.push(newest);
    for(const older of items.slice(1)){
      superseded.push({...older,supersededBy:newest.fact});
      if(older.valueSignature&&newest.valueSignature&&older.valueSignature!==newest.valueSignature){
        conflicts.push({topic,newest:newest.fact,older:older.fact,newestRecency:newest.recency,olderRecency:older.recency});
      }
    }
  }

  return {
    active:active.sort((a,b)=>(b.score||0)-(a.score||0)||(a.recency||0)-(b.recency||0)),
    superseded,
    conflicts,
    topics:groups.size,
  };
}

function ledgerStats(ledger){
  return {
    topics:ledger?.topics||0,
    active:ledger?.active?.length||0,
    superseded:ledger?.superseded?.length||0,
    conflicts:ledger?.conflicts?.length||0,
  };
}

module.exports={normalize,lifecycle,topicKey,valueSignature,resolveRecords,ledgerStats};
