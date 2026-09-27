'use strict';

class DoomLoopDetector{
 constructor({window=12,repeatThreshold=3}={}){this.window=window;this.repeatThreshold=repeatThreshold;this.sessions=new Map();}
 record(sessionKey,{tool,argsHash,resultHash=null}){
  const key=String(sessionKey||'default'),list=this.sessions.get(key)||[];
  const row={tool:String(tool||''),argsHash:String(argsHash||''),resultHash:resultHash==null?null:String(resultHash)};
  list.push(row);while(list.length>this.window)list.shift();this.sessions.set(key,list);
  const same=list.filter(x=>x.tool===row.tool&&x.argsHash===row.argsHash);
  const exact=same.filter(x=>x.resultHash===row.resultHash);
  const stuck=exact.length>=this.repeatThreshold;
  return {stuck,repeats:exact.length,similarCalls:same.length,action:stuck?'interrupt-and-summarize':'continue'};
 }
 reset(sessionKey){this.sessions.delete(String(sessionKey||'default'));}
}
module.exports={DoomLoopDetector};
