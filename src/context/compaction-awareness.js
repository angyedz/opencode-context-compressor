'use strict';

const MAX_SESSIONS=64;
const state=new Map();

function now(){return Date.now();}

function ensure(sessionKey){
  const key=String(sessionKey||'default');
  if(!state.has(key)) state.set(key,{epoch:0,lastAt:null,last:null});
  const value=state.get(key);
  state.delete(key); state.set(key,value);
  while(state.size>MAX_SESSIONS) state.delete(state.keys().next().value);
  return value;
}

function record(sessionKey,report={}){
  const item=ensure(sessionKey);
  item.epoch+=1;
  item.lastAt=now();
  item.last={
    beforeTokens:Number(report?.before?.tokens||0),
    afterTokens:Number(report?.after?.tokens||0),
    savedTokens:Number(report?.savings?.tokens||0),
    quality:Number(report?.quality?.score||0),
    provenance:report?.provenance?{
      retained:report.provenance.retained,
      removed:report.provenance.removed,
      synthesized:report.provenance.synthesized,
    }:null,
  };
  return snapshot(sessionKey);
}

function snapshot(sessionKey){
  const item=ensure(sessionKey);
  return {epoch:item.epoch,lastAt:item.lastAt,last:item.last?{...item.last}:null};
}

function systemSignal(sessionKey){
  const item=snapshot(sessionKey);
  if(!item.epoch||!item.last) return null;
  return {
    role:'system',
    content:`[Context runtime] Compaction epoch ${item.epoch} completed. Approximately ${item.last.savedTokens} tokens were removed. Historical compacted material may be incomplete; re-check critical files/tool state when exact details matter.`,
  };
}

function clear(sessionKey){state.delete(String(sessionKey||'default'));}

module.exports={record,snapshot,systemSignal,clear};
