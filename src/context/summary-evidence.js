'use strict';

const {factEntities}=require('./semantic-graph');

function sourceEntitySet(messages){
 const set=new Set();
 for(const m of messages||[]){
  let text='';
  if(typeof m?.content==='string')text=m.content;
  else {try{text=JSON.stringify(m?.content||'');}catch(_){}}
  for(const e of factEntities(text))set.add(e);
 }
 return set;
}
function concreteEntities(text){
 return factEntities(String(text||'')).filter(e=>
  /[/.]/.test(e)||/^err_/i.test(e)||/error$/i.test(e)||/^test[:#._-]/i.test(e)||/^spec[:#._-]/i.test(e)
 );
}
function verify(summary,sourceMessages,{allow=[]}={}){
 const source=sourceEntitySet(sourceMessages),allowed=new Set(allow.map(String));
 const text=typeof summary==='string'?summary:(summary?.content||'');
 const entities=concreteEntities(typeof text==='string'?text:JSON.stringify(text));
 const unsupported=[...new Set(entities.filter(e=>!source.has(e)&&!allowed.has(e)))];
 return {valid:unsupported.length===0,unsupported,entitiesChecked:entities.length,sourceEntities:source.size};
}
module.exports={sourceEntitySet,concreteEntities,verify};
