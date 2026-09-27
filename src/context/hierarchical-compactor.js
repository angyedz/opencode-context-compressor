'use strict';

const {plan}=require('./chunk-planner');
const {validateSummary}=require('./summary-validator');

async function summarizeLevel(messages,summarize,{chunkChars=24000,overlap=1,requiredAnchors=[]}={}){
 const p=plan(messages,{maxChars:chunkChars,overlap});
 const summaries=[];
 for(const chunk of p.chunks){
  const result=await summarize(chunk.messages,{start:chunk.start,end:chunk.end,chars:chunk.chars});
  const sourceChars=chunk.messages.reduce((n,m)=>{try{return n+JSON.stringify(m).length;}catch(_){return n;}},0);
  const validation=validateSummary(result,{sourceChars,requiredAnchors});
  if(!validation.valid)return {valid:false,failedChunk:{start:chunk.start,end:chunk.end,validation},summaries};
  summaries.push({role:'user',content:typeof result==='string'?result:result.content,meta:{sourceStart:chunk.start,sourceEnd:chunk.end}});
 }
 return {valid:true,summaries,plan:p};
}
async function hierarchical(messages,summarize,{targetChars=16000,maxLevels=4,chunkChars=24000,overlap=1,requiredAnchors=[]}={}){
 let current=messages,levels=[];
 for(let level=0;level<maxLevels;level++){
  const chars=JSON.stringify(current).length;
  if(chars<=targetChars)return {valid:true,messages:current,levels,complete:true};
  const result=await summarizeLevel(current,summarize,{chunkChars,overlap,requiredAnchors});
  levels.push({level,inputChars:chars,chunks:result.plan?.totalChunks||0,valid:result.valid});
  if(!result.valid)return {valid:false,messages:current,levels,failedChunk:result.failedChunk};
  const next=result.summaries;
  if(JSON.stringify(next).length>=chars)return {valid:false,messages:current,levels,reason:'non-decreasing-level'};
  current=next;
 }
 return {valid:JSON.stringify(current).length<=targetChars,messages:current,levels,complete:JSON.stringify(current).length<=targetChars};
}
module.exports={summarizeLevel,hierarchical};
