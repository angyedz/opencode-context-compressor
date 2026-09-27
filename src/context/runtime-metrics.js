'use strict';

const MAX_SESSIONS=64;
const sessions=new Map();

function touch(sessionKey,report){
  const key=String(sessionKey||'default');
  sessions.delete(key);
  sessions.set(key,{...report});
  while(sessions.size>MAX_SESSIONS){
    const oldest=sessions.keys().next().value;
    sessions.delete(oldest);
  }
}

function get(sessionKey){return sessions.get(String(sessionKey||'default'))||null;}

function clear(sessionKey){
  if(sessionKey===undefined){sessions.clear();return;}
  sessions.delete(String(sessionKey||'default'));
}

function aggregate(){
  const reports=[...sessions.values()];
  const total=(path)=>reports.reduce((sum,r)=>sum+(path(r)||0),0);
  return {
    sessions:reports.length,
    beforeTokens:total(r=>r.before?.tokens),
    afterTokens:total(r=>r.after?.tokens),
    savedTokens:total(r=>r.savings?.tokens),
    averageQuality:reports.length?reports.reduce((s,r)=>s+(r.quality?.score||0),0)/reports.length:0,
  };
}

module.exports={touch,get,clear,aggregate};
