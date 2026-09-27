'use strict';

function clamp(n,min,max){return Math.max(min,Math.min(max,n));}

function pressure({
  inputTokens=0,
  toolSchemaTokens=0,
  providerLimit=0,
  outputReserve=0,
  safetyReserve=512,
}={}){
  const limit=Number(providerLimit)||0;
  if(limit<=0) return {known:false,ratio:0,available:Infinity,used:Number(inputTokens)||0};
  const available=Math.max(1,limit-(Number(outputReserve)||0)-(Number(safetyReserve)||0));
  const used=Math.max(0,(Number(inputTokens)||0)+(Number(toolSchemaTokens)||0));
  return {known:true,ratio:used/available,available,used,headroom:available-used};
}

function decision(metrics,{soft=0.72,hard=0.86,emergency=0.96,lastCompactedRatio=null}={}){
  const p=pressure(metrics);
  if(!p.known) return {...p,action:'observe',reason:'unknown-provider-limit'};
  if(p.ratio>=emergency) return {...p,action:'emergency-compact',reason:'near-provider-limit'};
  if(p.ratio>=hard) return {...p,action:'compact',reason:'hard-pressure'};
  if(p.ratio>=soft){
    if(lastCompactedRatio!=null&&p.ratio<=lastCompactedRatio+0.03) return {...p,action:'observe',reason:'hysteresis'};
    return {...p,action:'compact-soon',reason:'soft-pressure'};
  }
  return {...p,action:'observe',reason:'healthy'};
}

class PressureController{
  constructor(options={}){this.options=options;this.sessions=new Map();}
  evaluate(sessionKey,metrics){
    const key=String(sessionKey||'default');
    const prev=this.sessions.get(key);
    const result=decision(metrics,{...this.options,lastCompactedRatio:prev?.lastCompactedRatio??null});
    this.sessions.set(key,{lastRatio:result.ratio,lastAction:result.action,lastCompactedRatio:prev?.lastCompactedRatio??null});
    return result;
  }
  markCompacted(sessionKey,ratio){
    const key=String(sessionKey||'default'),prev=this.sessions.get(key)||{};
    this.sessions.set(key,{...prev,lastCompactedRatio:Number(ratio)||0});
  }
  reset(sessionKey){this.sessions.delete(String(sessionKey||'default'));}
}

module.exports={clamp,pressure,decision,PressureController};
