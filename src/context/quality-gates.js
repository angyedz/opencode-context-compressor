'use strict';

const { validateToolProtocol } = require('./protocol-integrity');
const { estimateMessagesTokens } = require('./token-budget');

function textOf(content){
  if(typeof content==='string') return content;
  if(Array.isArray(content)) return content.map(p=>typeof p==='string'?p:(p?.text||'')).join('\n');
  return content?.text||'';
}

function lastUser(messages){
  for(let i=(messages||[]).length-1;i>=0;i--) if(messages[i]?.role==='user') return textOf(messages[i].content);
  return '';
}

function anchorCoverage(messages,anchors){
  if(!anchors?.length) return 1;
  let serialized='';
  try{serialized=JSON.stringify(messages).toLowerCase();}catch(_){serialized=String(messages).toLowerCase();}
  const hits=anchors.filter(a=>serialized.includes(String(a).toLowerCase())).length;
  return hits/anchors.length;
}

function evaluateCompression({input,output,anchors=[],maxTokens=null,maxChars=null}={}){
  const inputUser=lastUser(input);
  const outputUser=lastUser(output);
  const protocol=validateToolProtocol(output);
  let chars=0;
  try{chars=JSON.stringify(output).length;}catch(_){chars=0;}
  const tokens=estimateMessagesTokens(output);
  const checks={
    currentTurnExact: inputUser===outputUser,
    protocolValid: protocol.valid,
    anchorCoverage: anchorCoverage(output,anchors),
    charBudgetOk: !maxChars || chars<=maxChars*1.2,
    tokenBudgetOk: !maxTokens || tokens<=maxTokens*1.2,
    nonEmpty: Array.isArray(output)&&output.length>0,
  };
  const score=
    (checks.currentTurnExact?30:0)+
    (checks.protocolValid?25:0)+
    Math.round(checks.anchorCoverage*25)+
    (checks.charBudgetOk?8:0)+
    (checks.tokenBudgetOk?8:0)+
    (checks.nonEmpty?4:0);
  return {score,checks,chars,tokens,protocol};
}

function assertCompressionQuality(args,{minimumScore=90,minAnchorCoverage=0.8}={}){
  const report=evaluateCompression(args);
  if(report.score<minimumScore||report.checks.anchorCoverage<minAnchorCoverage){
    const error=new Error(`Compression quality gate failed: score=${report.score}, anchorCoverage=${report.checks.anchorCoverage.toFixed(2)}`);
    error.code='ERR_CONTEXT_QUALITY_GATE';
    error.report=report;
    throw error;
  }
  return report;
}

module.exports={lastUser,anchorCoverage,evaluateCompression,assertCompressionQuality};
