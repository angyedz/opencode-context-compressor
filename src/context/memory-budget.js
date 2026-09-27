'use strict';

function estimateObjectBytes(value){
 try{return Buffer.byteLength(JSON.stringify(value),'utf8');}catch(_){return Infinity;}
}
function enforce(items,{maxItems=256,maxBytes=8*1024*1024,sizeOf=estimateObjectBytes,scoreOf=()=>0}={}){
 const rows=(items||[]).map((item,index)=>({item,index,bytes:sizeOf(item),score:Number(scoreOf(item,index))||0}));
 rows.sort((a,b)=>b.score-a.score||b.index-a.index);
 const kept=[];let bytes=0;
 for(const row of rows){
  if(kept.length>=maxItems)break;
  if(bytes+row.bytes>maxBytes)continue;
  kept.push(row);bytes+=row.bytes;
 }
 kept.sort((a,b)=>a.index-b.index);
 const keepSet=new Set(kept.map(x=>x.index));
 return {items:kept.map(x=>x.item),bytes,dropped:rows.filter(x=>!keepSet.has(x.index)).length,total:rows.length};
}
module.exports={estimateObjectBytes,enforce};
