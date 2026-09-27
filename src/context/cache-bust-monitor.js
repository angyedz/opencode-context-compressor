'use strict';

class CacheBustMonitor{
 constructor({windowSize=40,warnRate=0.15,minSamples=8}={}){this.windowSize=windowSize;this.warnRate=warnRate;this.minSamples=minSamples;this.sessions=new Map();}
 record(sessionKey,{cacheReadTokens=0,cacheWriteTokens=0,inputTokens=0,finishReason=null}={}){
  const key=String(sessionKey||'default'),list=this.sessions.get(key)||[];
  const expectedCache=inputTokens>0&&list.length>0;
  const bust=expectedCache&&Number(cacheReadTokens)===0&&Number(cacheWriteTokens)>0;
  list.push({bust,cacheReadTokens:Number(cacheReadTokens)||0,cacheWriteTokens:Number(cacheWriteTokens)||0,inputTokens:Number(inputTokens)||0,finishReason});
  while(list.length>this.windowSize)list.shift();this.sessions.set(key,list);
  return this.stats(key);
 }
 stats(sessionKey){
  const list=this.sessions.get(String(sessionKey||'default'))||[];
  const busts=list.filter(x=>x.bust).length,rate=list.length?busts/list.length:0;
  return {samples:list.length,busts,rate,warn:list.length>=this.minSamples&&rate>=this.warnRate,cacheReadTokens:list.reduce((n,x)=>n+x.cacheReadTokens,0),cacheWriteTokens:list.reduce((n,x)=>n+x.cacheWriteTokens,0)};
 }
 clear(sessionKey){this.sessions.delete(String(sessionKey||'default'));}
}
module.exports={CacheBustMonitor};
