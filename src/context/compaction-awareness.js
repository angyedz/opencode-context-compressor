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

function signalMessage(epoch,savedTokens){
  return {
    role:'system',
    content:`[Context runtime] Compaction epoch ${epoch}: ~${Math.max(0,Math.round(Number(savedTokens)||0))} tokens removed. Historical compacted material can omit exact detail; re-check critical files/tool state when precision matters.`,
  };
}

function previewSignal(sessionKey,report={},minSavedTokens=512){
  const saved=Number(report?.savings?.tokens||0);
  if(!Number.isFinite(saved)||saved<minSavedTokens) return null;
  const item=snapshot(sessionKey);
  return signalMessage(item.epoch+1,saved);
}

function systemSignal(sessionKey){
  const item=snapshot(sessionKey);
  if(!item.epoch||!item.last) return null;
  return signalMessage(item.epoch,item.last.savedTokens);
}

function clear(sessionKey){state.delete(String(sessionKey||'default'));}

module.exports={record,snapshot,signalMessage,previewSignal,systemSignal,clear};
