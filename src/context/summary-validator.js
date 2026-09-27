'use strict';

function textOf(value){
 if(typeof value==='string')return value;
 if(Array.isArray(value))return value.map(v=>typeof v==='string'?v:(v?.text||'')).join('\n');
 return value?.text||'';
}
function meaningful(text){
 const t=String(text||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
 return t.length>=80&&/[A-Za-zА-Яа-я0-9]/.test(t);
}
function validateSummary(summary,{sourceChars=0,minRatio=0.002,maxRatio=0.65,requiredAnchors=[]}={}){
 const text=textOf(summary?.content??summary);
 const chars=text.length;
 const ratio=sourceChars>0?chars/sourceChars:0;
 const lower=text.toLowerCase();
 const missingAnchors=(requiredAnchors||[]).filter(a=>!lower.includes(String(a).toLowerCase()));
 const checks={
  hasText:meaningful(text),
  notReasoningOnly:!(Array.isArray(summary?.content)&&summary.content.length>0&&summary.content.every(p=>p?.type==='reasoning'||p?.type==='thinking')),
  minimumInformation:sourceChars<1000||ratio>=minRatio,
  actuallyCompressed:sourceChars<=0||ratio<=maxRatio,
  anchorsPreserved:missingAnchors.length===0,
 };
 return {valid:Object.values(checks).every(Boolean),checks,chars,ratio,missingAnchors};
}
module.exports={textOf,meaningful,validateSummary};
