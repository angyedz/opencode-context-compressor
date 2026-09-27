'use strict';

const crypto=require('crypto');

function id(){return crypto.randomBytes(8).toString('hex');}
function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}

class CompactionTransaction{
  constructor({maxSnapshots=8}={}){
    this.maxSnapshots=maxSnapshots;this.sessions=new Map();
  }
  begin(sessionKey,messages,meta={}){
    const key=String(sessionKey||'default');
    const tx={id:id(),state:'prepared',createdAt:Date.now(),original:clone(messages),candidate:null,meta:{...meta}};
    const list=this.sessions.get(key)||[];list.push(tx);
    while(list.length>this.maxSnapshots) list.shift();
    this.sessions.set(key,list);
    return {id:tx.id,state:tx.state,createdAt:tx.createdAt};
  }
  stage(sessionKey,txId,candidate,validation=null){
    const tx=this._find(sessionKey,txId);if(!tx||tx.state!=='prepared')return null;
    tx.candidate=clone(candidate);tx.validation=validation;tx.state='staged';return {id:tx.id,state:tx.state};
  }
  commit(sessionKey,txId){
    const tx=this._find(sessionKey,txId);if(!tx||tx.state!=='staged')return null;
    tx.state='committed';tx.committedAt=Date.now();tx.original=null;
    return clone(tx.candidate);
  }
  rollback(sessionKey,txId,reason='validation-failed'){
    const tx=this._find(sessionKey,txId);if(!tx)return null;
    const original=clone(tx.original);tx.state='rolled-back';tx.reason=reason;tx.candidate=null;
    return original;
  }
  _find(sessionKey,txId){return (this.sessions.get(String(sessionKey||'default'))||[]).find(x=>x.id===txId)||null;}
  status(sessionKey){return (this.sessions.get(String(sessionKey||'default'))||[]).map(({original,candidate,...x})=>({...x,hasRollback:!!original}));}
}
module.exports={clone,CompactionTransaction};
