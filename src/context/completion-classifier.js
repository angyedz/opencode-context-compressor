'use strict';

const TRUNCATED=new Set(['length','max_tokens','max_output_tokens','content_filter','output_limit']);
const COMPLETE=new Set(['stop','end_turn','completed','complete','tool_calls','tool_use']);

function classify({finishReason=null,stopReason=null,outputTokens=null,advertisedMaxOutput=null,text=''}={}){
 const reason=String(finishReason||stopReason||'').toLowerCase();
 if(TRUNCATED.has(reason))return {state:'incomplete',reason:'output-limit',continuationNeeded:true};
 if(advertisedMaxOutput&&Number(outputTokens)>=Number(advertisedMaxOutput)&&!COMPLETE.has(reason))return {state:'incomplete',reason:'token-budget-exhausted',continuationNeeded:true};
 if(COMPLETE.has(reason))return {state:'complete',reason,continuationNeeded:false};
 if(!String(text||'').trim())return {state:'empty',reason:reason||'no-output',continuationNeeded:true};
 return {state:'unknown',reason:reason||'missing-finish-reason',continuationNeeded:false};
}
function marker(result){
 if(result.state!=='incomplete')return null;
 return `[Incomplete assistant turn: ${result.reason}. Do not treat unfinished plans, edits, tests, or conclusions as completed state.]`;
}
module.exports={TRUNCATED,COMPLETE,classify,marker};
