'use strict';

const MAX_KEYS=128;
const MIN_FACTOR=0.45;
const MAX_FACTOR=2.5;
const ALPHA=0.18;
const entries=new Map();

function clamp(value,min=MIN_FACTOR,max=MAX_FACTOR){
  return Math.max(min,Math.min(max,value));
}

function calibrationKey(provider='',model=''){
  return `${String(provider||'unknown').toLowerCase()}|${String(model||'unknown').toLowerCase()}`;
}

function get(provider,model){
  const key=calibrationKey(provider,model);
  return entries.get(key)||{factor:1,samples:0,lastUpdated:0};
}

function record(provider,model,estimatedTokens,actualTokens){
  const estimated=Number(estimatedTokens);
  const actual=Number(actualTokens);
  if(!Number.isFinite(estimated)||estimated<=0||!Number.isFinite(actual)||actual<=0) return get(provider,model);

  const key=calibrationKey(provider,model);
  const previous=get(provider,model);
  const observed=clamp(actual/estimated);
  const factor=previous.samples===0
    ? observed
    : clamp(previous.factor*(1-ALPHA)+observed*ALPHA);

  entries.delete(key);
  entries.set(key,{factor,samples:previous.samples+1,lastUpdated:Date.now(),lastObserved:observed});
  while(entries.size>MAX_KEYS){
    entries.delete(entries.keys().next().value);
  }
  return entries.get(key);
}

function factor(provider,model){return get(provider,model).factor;}

function calibrateEstimate(tokens,provider,model){
  const n=Number(tokens)||0;
  return Math.max(0,Math.ceil(n*factor(provider,model)));
}

function extractActualPromptTokens(payload){
  if(!payload||typeof payload!=='object') return null;
  const candidates=[
    payload?.usage?.prompt_tokens,
    payload?.usage?.input_tokens,
    payload?.usageMetadata?.promptTokenCount,
    payload?.usage_metadata?.prompt_token_count,
    payload?.message?.usage?.input_tokens,
  ];
  for(const value of candidates){
    const n=Number(value);
    if(Number.isFinite(n)&&n>=0) return n;
  }
  return null;
}

function extractUsageFromText(text){
  const source=String(text||'').trim();
  if(!source) return null;

  try{
    const parsed=JSON.parse(source);
    const direct=extractActualPromptTokens(parsed);
    if(direct!==null) return direct;
  }catch(_){}

  let found=null;
  for(const line of source.split(/\r?\n/)){
    const trimmed=line.trim();
    if(!trimmed.startsWith('data:')) continue;
    const body=trimmed.slice(5).trim();
    if(!body||body==='[DONE]') continue;
    try{
      const value=extractActualPromptTokens(JSON.parse(body));
      if(value!==null) found=value;
    }catch(_){}
  }
  return found;
}

function stats(){
  return [...entries.entries()].map(([key,value])=>({key,...value}));
}

function clear(provider,model){
  if(provider===undefined){entries.clear();return;}
  entries.delete(calibrationKey(provider,model));
}

module.exports={
  MAX_KEYS,
  MIN_FACTOR,
  MAX_FACTOR,
  ALPHA,
  clamp,
  calibrationKey,
  get,
  record,
  factor,
  calibrateEstimate,
  extractActualPromptTokens,
  extractUsageFromText,
  stats,
  clear,
};
