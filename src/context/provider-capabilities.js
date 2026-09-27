'use strict';

const MAX_PROVIDERS=64;
const learned=new Map();

const PATTERNS=[
  /request\s*\((\d+)\s*tokens?\)\s*exceeds.*?\((\d+)\s*tokens?\)/i,
  /context(?:\s+window|\s+size)?[^\d]{0,30}(\d+).*?(?:max|limit|available)[^\d]{0,20}(\d+)/i,
  /maximum context length is\s*(\d+)/i,
  /max(?:imum)? tokens allowed[^\d]*(\d+)/i,
];

function parseContextLimit(error){
  const text=String(error?.message||error||'');
  let m=PATTERNS[0].exec(text);
  if(m) return {requested:Number(m[1]),limit:Number(m[2]),source:'request-exceeds'};
  m=PATTERNS[2].exec(text);
  if(m) return {requested:null,limit:Number(m[1]),source:'maximum-context'};
  m=PATTERNS[3].exec(text);
  if(m) return {requested:null,limit:Number(m[1]),source:'max-allowed'};
  m=PATTERNS[1].exec(text);
  if(m){
    const a=Number(m[1]),b=Number(m[2]);
    return {requested:Math.max(a,b),limit:Math.min(a,b),source:'generic-context'};
  }
  return null;
}

function learn(providerKey,error,{safetyMargin=0.92}={}){
  const parsed=parseContextLimit(error);
  if(!parsed?.limit) return null;
  const key=String(providerKey||'default');
  const safe=Math.max(512,Math.floor(parsed.limit*safetyMargin));
  const old=learned.get(key);
  const next={limit:old?Math.min(old.limit,safe):safe,reportedLimit:parsed.limit,source:parsed.source,updatedAt:Date.now()};
  learned.delete(key); learned.set(key,next);
  while(learned.size>MAX_PROVIDERS) learned.delete(learned.keys().next().value);
  return {...next};
}
function get(providerKey){const v=learned.get(String(providerKey||'default'));return v?{...v}:null;}
function effectiveLimit(providerKey,configured){
  const observed=get(providerKey);
  const c=Number(configured);
  if(!observed) return Number.isFinite(c)&&c>0?c:null;
  if(!Number.isFinite(c)||c<=0) return observed.limit;
  return Math.min(c,observed.limit);
}
function clear(providerKey){if(providerKey===undefined) learned.clear();else learned.delete(String(providerKey||'default'));}

module.exports={PATTERNS,parseContextLimit,learn,get,effectiveLimit,clear};
