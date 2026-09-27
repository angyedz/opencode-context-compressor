'use strict';

function isSemanticBoundary(message){
 if(!message)return false;
 if(message.role==='user')return true;
 if(message.role==='tool')return true;
 if(message.role==='assistant'){
  if(message.tool_calls?.length||message.function_call)return true;
  if(Array.isArray(message.content)&&message.content.some(p=>['tool_use','tool_result'].includes(p?.type)||p?.functionCall||p?.functionResponse))return true;
 }
 return false;
}
function boundaryScore(message){
 if(!message)return 0;
 if(message.role==='user')return 5;
 if(message.role==='tool')return 4;
 if(message.tool_calls?.length||message.function_call)return 3;
 if(Array.isArray(message.content)&&message.content.some(p=>p?.type==='tool_result'||p?.functionResponse))return 4;
 if(Array.isArray(message.content)&&message.content.some(p=>p?.type==='tool_use'||p?.functionCall))return 3;
 return 1;
}
function findReplayBoundary(messages,{targetIndex=null,minPrefix=1}={}){
 const list=messages||[];
 let start=targetIndex==null?list.length-1:Math.min(list.length-1,targetIndex);
 let best=-1,bestScore=-1;
 for(let i=start;i>=minPrefix;i--){
  if(!isSemanticBoundary(list[i]))continue;
  const score=boundaryScore(list[i]);
  if(score>bestScore){best=i;bestScore=score;}
  if(score>=4)return i;
 }
 return best>=0?best:Math.max(minPrefix,start);
}
function partition(messages,options={}){
 const boundary=findReplayBoundary(messages,options);
 return {boundary,prefix:(messages||[]).slice(0,boundary),continuation:(messages||[]).slice(boundary)};
}
module.exports={isSemanticBoundary,boundaryScore,findReplayBoundary,partition};
