'use strict';

class MonotonicContextAssembler{
 constructor(){this.sessions=new Map();}
 commit(sessionKey,messages,{configVersion=null}={}){
  const key=String(sessionKey||'default'),prev=this.sessions.get(key)||{bySeq:new Map(),configVersion:null};
  for(let i=0;i<(messages||[]).length;i++){
   const m=messages[i],seq=Number(m?.seq??m?.sequence??i);
   const old=prev.bySeq.get(seq);
   if(!old||JSON.stringify(old)!==JSON.stringify(m))prev.bySeq.set(seq,m);
  }
  prev.configVersion=configVersion??prev.configVersion;this.sessions.set(key,prev);
  return this.snapshot(key);
 }
 snapshot(sessionKey){
  const s=this.sessions.get(String(sessionKey||'default'));if(!s)return {messages:[],lastSeq:-1,configVersion:null};
  const rows=[...s.bySeq.entries()].sort((a,b)=>a[0]-b[0]);
  return {messages:rows.map(x=>x[1]),lastSeq:rows.length?rows[rows.length-1][0]:-1,configVersion:s.configVersion};
 }
 reloadConfig(sessionKey,version){const key=String(sessionKey||'default'),s=this.sessions.get(key)||{bySeq:new Map()};s.configVersion=version;this.sessions.set(key,s);return this.snapshot(key);}
}
module.exports={MonotonicContextAssembler};
