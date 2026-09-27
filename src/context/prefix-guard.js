'use strict';

const {fingerprint}=require('./prompt-cache-identity');

class PrefixGuard{
 constructor(){this.sessions=new Map();}
 freeze(sessionKey,messages,count){
  const key=String(sessionKey||'default'),fp=fingerprint(messages,{count});
  const state={count,fp,frozenAt:Date.now()};this.sessions.set(key,state);return {...state};
 }
 verify(sessionKey,messages){
  const state=this.sessions.get(String(sessionKey||'default'));if(!state)return {valid:true,reason:'no-frozen-prefix'};
  const actual=fingerprint(messages,{count:state.count});
  return {valid:actual===state.fp,expected:state.fp,actual,count:state.count,reason:actual===state.fp?'stable':'historical-prefix-mutated'};
 }
 thaw(sessionKey){this.sessions.delete(String(sessionKey||'default'));}
}
module.exports={PrefixGuard};
