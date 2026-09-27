'use strict';

function messageIdentity(message,index){
 const role=message?.role||'unknown';
 const callIds=(message?.tool_calls||[]).map(c=>c?.id).filter(Boolean);
 const resultId=message?.tool_call_id||null;
 return {index,role,callIds,resultId};
}
function protocolEdges(messages){
 const calls=new Map(),results=new Map();
 for(let i=0;i<(messages||[]).length;i++){
  const m=messages[i];
  for(const call of m?.tool_calls||[])if(call?.id)calls.set(call.id,i);
  if(m?.role==='tool'&&m.tool_call_id)results.set(m.tool_call_id,i);
  for(const p of Array.isArray(m?.content)?m.content:[]){
   if(p?.type==='tool_use'&&p.id)calls.set(p.id,i);
   if(p?.type==='tool_result'&&p.tool_use_id)results.set(p.tool_use_id,i);
  }
 }
 return [...new Set([...calls.keys(),...results.keys()])].map(id=>({id,call:calls.get(id)??null,result:results.get(id)??null}));
}
function unsafeBoundaries(messages){
 const edges=protocolEdges(messages),unsafe=new Set();
 for(const e of edges){
  if(e.call==null||e.result==null)continue;
  const a=Math.min(e.call,e.result),b=Math.max(e.call,e.result);
  for(let boundary=a+1;boundary<=b;boundary++)unsafe.add(boundary);
 }
 return unsafe;
}
function adjustBoundary(messages,desired){
 const unsafe=unsafeBoundaries(messages);
 let b=Math.max(1,Math.min((messages||[]).length-1,desired));
 while(b>1&&unsafe.has(b))b--;
 if(!unsafe.has(b))return b;
 b=desired;while(b<(messages||[]).length-1&&unsafe.has(b))b++;
 return b;
}
module.exports={messageIdentity,protocolEdges,unsafeBoundaries,adjustBoundary};
