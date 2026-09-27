'use strict';

const crypto=require('crypto');

function signature(messages){
  const hash=crypto.createHash('sha256');
  for(const m of messages||[]){
    hash.update(String(m?.role||'')); hash.update('\0');
    if(typeof m?.content==='string') hash.update(m.content.slice(0,4096));
    else {try{hash.update(JSON.stringify(m?.content).slice(0,4096));}catch(_){}}
  }
  return hash.digest('hex').slice(0,16);
}

function tokenCount(report){
  return Number(report?.after?.tokens||report?.estimatedTokens||0);
}

class CompactionLoopGuard{
  constructor({maxConsecutive=3,minReduction=0.08}={}){
    this.maxConsecutive=maxConsecutive;
    this.minReduction=minReduction;
    this.sessions=new Map();
  }
  observe(sessionKey,{beforeTokens,afterTokens,productiveTurn=false,messages=[]}={}){
    const key=String(sessionKey||'default');
    if(productiveTurn){this.sessions.delete(key);return {allow:true,attempts:0,reason:'productive-turn'};}
    const previous=this.sessions.get(key)||{attempts:0,lastSignature:null};
    const reduction=beforeTokens>0?1-(afterTokens/Math.max(1,beforeTokens)):0;
    const sig=signature(messages);
    const ineffective=reduction<this.minReduction||sig===previous.lastSignature;
    const attempts=ineffective?previous.attempts+1:0;
    const state={attempts,lastSignature:sig,reduction,updatedAt:Date.now()};
    this.sessions.set(key,state);
    return {
      allow:attempts<this.maxConsecutive,
      attempts,
      reduction,
      reason:attempts>=this.maxConsecutive?'repeated-ineffective-compaction':ineffective?'insufficient-reduction':'effective',
    };
  }
  reset(sessionKey){this.sessions.delete(String(sessionKey||'default'));}
  get(sessionKey){return this.sessions.get(String(sessionKey||'default'))||null;}
}

module.exports={signature,tokenCount,CompactionLoopGuard};
