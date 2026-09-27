'use strict';

const protocol=require('./protocol-integrity');
const provenance=require('./provenance-ledger');
const tokens=require('./token-budget');

function systemDigests(messages){
  return (messages||[]).filter(m=>m?.role==='system').map((m,i)=>provenance.messageRecord(m,i).digest);
}

function finitePayload(value,seen=new Set()){
  if(value===null||value===undefined) return value!==undefined;
  if(typeof value==='number') return Number.isFinite(value);
  if(typeof value!=='object') return true;
  if(seen.has(value)) return true;
  seen.add(value);
  if(Array.isArray(value)) return value.every(v=>finitePayload(v,seen));
  return Object.values(value).every(v=>finitePayload(v,seen));
}

function evaluate(input,output,{maxTokens=null,maxChars=null}={}){
  let chars=0;try{chars=JSON.stringify(output).length;}catch(_){chars=Infinity;}
  const estimatedTokens=tokens.estimateMessagesTokens(output);
  const beforeSystems=systemDigests(input),afterSystems=new Set(systemDigests(output));
  const checks={
    array:Array.isArray(output),
    nonEmpty:Array.isArray(output)&&output.length>0,
    currentUserExact:provenance.verifyCurrentUser(input,output),
    systemMessagesPreserved:beforeSystems.every(x=>afterSystems.has(x)),
    protocolValid:protocol.validateToolProtocol(output).valid,
    finitePayload:finitePayload(output),
    charBudget:!maxChars||chars<=maxChars*1.25,
    tokenBudget:!maxTokens||estimatedTokens<=maxTokens*1.25,
  };
  return {valid:Object.values(checks).every(Boolean),checks,chars,estimatedTokens};
}

function assert(input,output,options={}){
  const report=evaluate(input,output,options);
  if(!report.valid){
    const failed=Object.entries(report.checks).filter(([,v])=>!v).map(([k])=>k);
    const error=new Error(`Context invariant violation: ${failed.join(', ')}`);
    error.code='ERR_CONTEXT_INVARIANT';
    error.report=report;
    throw error;
  }
  return report;
}

module.exports={systemDigests,finitePayload,evaluate,assert};
