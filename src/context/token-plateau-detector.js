'use strict';

class TokenPlateauDetector{
 constructor({window=6,tolerance=0.005,minUtilization=0.7}={}){this.window=window;this.tolerance=tolerance;this.minUtilization=minUtilization;this.sessions=new Map();}
 observe(sessionKey,{inputTokens,configuredLimit=null,cacheReadTokens=null}={}){
  const key=String(sessionKey||'default'),list=this.sessions.get(key)||[];
  const tokens=Math.max(0,Number(inputTokens)||0);list.push({tokens,cacheReadTokens:Number(cacheReadTokens)||0});
  while(list.length>this.window)list.shift();this.sessions.set(key,list);
  if(list.length<this.window||tokens<=0)return {plateau:false,samples:list.length};
  const values=list.map(x=>x.tokens),max=Math.max(...values),min=Math.min(...values),spread=(max-min)/Math.max(1,max);
  const utilization=configuredLimit?max/Number(configuredLimit):1;
  const cacheCold=list.every(x=>x.cacheReadTokens===0);
  const plateau=spread<=this.tolerance&&utilization>=this.minUtilization;
  return {plateau,samples:list.length,observedCeiling:max,spread,utilization,cacheCold,action:plateau?'compact':'observe'};
 }
 reset(sessionKey){this.sessions.delete(String(sessionKey||'default'));}
}
module.exports={TokenPlateauDetector};
