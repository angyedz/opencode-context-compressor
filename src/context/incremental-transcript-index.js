'use strict';

function seqOf(message,index){return Number(message?.seq??message?.sequence??index);}
class IncrementalTranscriptIndex{
 constructor({maxMessages=4096}={}){this.maxMessages=maxMessages;this.sessions=new Map();}
 update(sessionKey,messages){
  const key=String(sessionKey||'default'),old=this.sessions.get(key)||{lastSeq:-Infinity,rows:[]};
  const appended=[];
  for(let i=0;i<(messages||[]).length;i++){
   const m=messages[i],seq=seqOf(m,i);
   if(seq<=old.lastSeq)continue;
   const row={seq,index:i,role:m?.role||'unknown',chars:typeof m?.content==='string'?m.content.length:JSON.stringify(m?.content||'').length,tool:!!(m?.tool_calls?.length||m?.tool_call_id)};
   old.rows.push(row);appended.push(row);old.lastSeq=Math.max(old.lastSeq,seq);
  }
  if(old.rows.length>this.maxMessages)old.rows.splice(0,old.rows.length-this.maxMessages);
  this.sessions.set(key,old);
  return {appended,total:old.rows.length,lastSeq:old.lastSeq};
 }
 since(sessionKey,seq){return (this.sessions.get(String(sessionKey||'default'))?.rows||[]).filter(r=>r.seq>seq);}
 reset(sessionKey){this.sessions.delete(String(sessionKey||'default'));}
}
module.exports={seqOf,IncrementalTranscriptIndex};
