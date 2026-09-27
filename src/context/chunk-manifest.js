'use strict';

const crypto=require('crypto');
function digest(value){return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,16);}
function manifest(chunks,totalMessages){
 const ranges=(chunks||[]).map(c=>({start:c.start,end:c.end,digest:digest(c.messages),count:c.messages.length}));
 const covered=new Set();for(const r of ranges)for(let i=r.start;i<=r.end;i++)covered.add(i);
 const missing=[];for(let i=0;i<totalMessages;i++)if(!covered.has(i))missing.push(i);
 return {ranges,totalMessages,covered:covered.size,missing,complete:missing.length===0,fingerprint:digest(ranges)};
}
function validate(m){
 if(!m||!Array.isArray(m.ranges))return {valid:false,reason:'invalid-manifest'};
 if(m.missing?.length)return {valid:false,reason:'coverage-gap',missing:m.missing};
 for(const r of m.ranges)if(r.start<0||r.end<r.start||r.end>=m.totalMessages)return {valid:false,reason:'invalid-range',range:r};
 return {valid:true};
}
module.exports={digest,manifest,validate};
