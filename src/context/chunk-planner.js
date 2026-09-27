'use strict';

function sizeOf(message){try{return JSON.stringify(message).length;}catch(_){return String(message?.content||'').length;}}
function chunkMessages(messages,{maxChars=24000,overlap=1}={}){
 const chunks=[];let current=[],used=0,start=0;
 for(let i=0;i<(messages||[]).length;i++){
  const m=messages[i],size=sizeOf(m);
  if(current.length&&used+size>maxChars){
   chunks.push({start,end:i-1,messages:current,chars:used});
   const carry=current.slice(-Math.max(0,overlap));
   current=carry;used=carry.reduce((n,x)=>n+sizeOf(x),0);start=Math.max(0,i-carry.length);
  }
  current.push(m);used+=size;
 }
 if(current.length)chunks.push({start,end:(messages||[]).length-1,messages:current,chars:used});
 return chunks;
}
function plan(messages,{maxChars=24000,overlap=1,maxChunks=64}={}){
 const chunks=chunkMessages(messages,{maxChars,overlap});
 return {chunks:chunks.slice(0,maxChunks),truncated:chunks.length>maxChunks,totalChunks:chunks.length,totalChars:chunks.reduce((n,c)=>n+c.chars,0)};
}
module.exports={sizeOf,chunkMessages,plan};
