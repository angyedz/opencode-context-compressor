'use strict';

const HISTORY_TAG='compacted_history';
const PROFILE_TAG='durable_profile_facts';

function escapeBoundary(text,tag){
  const source=String(text||'');
  const open=new RegExp('<\\s*'+tag+'\\s*>','gi');
  const close=new RegExp('<\\s*\\/\\s*'+tag+'\\s*>','gi');
  return source
    .replace(open,`&lt;${tag}&gt;`)
    .replace(close,`&lt;/${tag}&gt;`);
}

function escapeHistoricalData(text){return escapeBoundary(text,HISTORY_TAG);}
function escapeProfileData(text){return escapeBoundary(text,PROFILE_TAG);}

function sourceClass(role,{current=false}={}){
  if(role==='system') return 'system';
  if(role==='user') return current?'current-user':'historical-user';
  if(role==='assistant') return 'assistant-observation';
  if(role==='tool') return 'tool-observation';
  return 'unknown';
}

function factRecord(fact,{role='unknown',current=false,turnIndex=null,messageIndex=null,score=null,reasons=[],entities=[]}={}){
  return {
    fact:String(fact||''),
    source:sourceClass(role,{current}),
    role,
    turnIndex,
    messageIndex,
    score,
    reasons:[...reasons],
    entities:[...entities],
  };
}

function publicRecord(record){
  if(!record) return null;
  return {
    source:record.source,
    role:record.role,
    turnIndex:record.turnIndex,
    messageIndex:record.messageIndex,
    score:record.score,
    reasons:record.reasons,
    entities:record.entities,
  };
}

module.exports={
  HISTORY_TAG,
  PROFILE_TAG,
  escapeBoundary,
  escapeHistoricalData,
  escapeProfileData,
  sourceClass,
  factRecord,
  publicRecord,
};
