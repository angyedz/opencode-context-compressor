'use strict';

class SummaryDebouncer{
 constructor({minSteps=6,minNewChars=12000,maxAgeMs=120000}={}){this.minSteps=minSteps;this.minNewChars=minNewChars;this.maxAgeMs=maxAgeMs;this.sessions=new Map();}
 shouldRun(sessionKey,{step,newChars=0,force=false}={}){
  const key=String(sessionKey||'default'),now=Date.now(),s=this.sessions.get(key)||{lastStep:0,lastChars:0,lastAt:0};
  const due=force||step-s.lastStep>=this.minSteps||newChars-s.lastChars>=this.minNewChars||now-s.lastAt>=this.maxAgeMs;
  return {run:due,reason:force?'forced':step-s.lastStep>=this.minSteps?'steps':newChars-s.lastChars>=this.minNewChars?'chars':now-s.lastAt>=this.maxAgeMs?'age':'debounced'};
 }
 mark(sessionKey,{step,newChars=0}={}){this.sessions.set(String(sessionKey||'default'),{lastStep:step,lastChars:newChars,lastAt:Date.now()});}
 reset(sessionKey){this.sessions.delete(String(sessionKey||'default'));}
}
module.exports={SummaryDebouncer};
