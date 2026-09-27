'use strict';

const capabilities=require('./provider-capabilities');

function isContextOverflow(error){
  const text=String(error?.message||error||'').toLowerCase();
  return !!capabilities.parseContextLimit(error)||
    /context.*(?:too large|overflow|exceed|length|limit)/i.test(text)||
    /too many tokens/i.test(text);
}

function policy({attempt=0,beforeTokens=0,afterTokens=0,error=null}={}){
  if(!isContextOverflow(error)) return {action:'propagate',retry:false,reason:'not-context-overflow'};
  const reduction=beforeTokens>0?1-afterTokens/Math.max(1,beforeTokens):0;
  if(attempt===0) return {action:'emergency-compact',retry:true,reason:'first-overflow',reduction};
  if(attempt===1&&reduction>=0.15) return {action:'retry-minimal',retry:true,reason:'meaningful-first-reduction',reduction};
  return {action:'stop',retry:false,reason:reduction<0.15?'ineffective-reduction':'retry-budget-exhausted',reduction};
}

function minimalOptions(providerLimit,{outputReserve=1024}={}){
  const limit=Math.max(1024,Number(providerLimit)||8192);
  const input=Math.max(512,limit-outputReserve-512);
  return {
    maxInputTokens:input,
    maxTokens:Math.max(512,Math.floor(input*0.7)),
    maxChars:Math.max(2000,Math.floor(input*2.6)),
    emergency:true,
  };
}

function learnAndPlan(providerKey,error,attempt,stats={}){
  const learned=capabilities.learn(providerKey,error);
  const decision=policy({attempt,error,...stats});
  return {
    learned,
    decision,
    options:learned&&decision.retry?minimalOptions(learned.limit):null,
  };
}

module.exports={isContextOverflow,policy,minimalOptions,learnAndPlan};
