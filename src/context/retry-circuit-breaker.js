'use strict';

class RetryCircuitBreaker{
 constructor({maxRetries=5,baseDelayMs=500,maxDelayMs=30000,cooldownMs=60000}={}){this.maxRetries=maxRetries;this.baseDelayMs=baseDelayMs;this.maxDelayMs=maxDelayMs;this.cooldownMs=cooldownMs;this.states=new Map();}
 next(key,{retryable=true,retryAfterMs=null}={}){
  key=String(key||'default');const now=Date.now(),s=this.states.get(key)||{attempts:0,openedAt:null};
  if(s.openedAt&&now-s.openedAt<this.cooldownMs)return {allow:false,state:'open',attempts:s.attempts,retryInMs:this.cooldownMs-(now-s.openedAt)};
  if(!retryable){this.states.delete(key);return {allow:false,state:'non-retryable',attempts:s.attempts};}
  s.attempts++;if(s.attempts>this.maxRetries){s.openedAt=now;this.states.set(key,s);return {allow:false,state:'open',attempts:s.attempts,retryInMs:this.cooldownMs};}
  const exponential=Math.min(this.maxDelayMs,this.baseDelayMs*Math.pow(2,s.attempts-1));
  const delay=retryAfterMs!=null?Math.max(exponential,Number(retryAfterMs)||0):exponential;
  this.states.set(key,s);return {allow:true,state:'closed',attempts:s.attempts,delayMs:delay};
 }
 success(key){this.states.delete(String(key||'default'));}
 reset(key){this.states.delete(String(key||'default'));}
}
module.exports={RetryCircuitBreaker};
