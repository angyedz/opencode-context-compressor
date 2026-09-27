'use strict';

const {callInfo,resultText,READ_NAMES,WRITE_NAMES}=require('./file-working-set');
const {digest,normalizePath}=require('./file-read-cache');

function replaceContent(message,text){
  if(typeof message.content==='string') return {...message,content:text};
  if(Array.isArray(message.content)){
    let done=false;
    return {...message,content:message.content.map(p=>{
      if(!done&&p&&typeof p==='object'&&typeof p.text==='string'){done=true;return {...p,text};}
      if(!done&&typeof p==='string'){done=true;return text;}
      return p;
    })};
  }
  return message;
}

function compactRepeatedFileReads(messages){
  const pending=new Map();
  const lastByPath=new Map();
  const invalidatedAt=new Map();
  const occurrences=[];

  for(let i=0;i<(messages||[]).length;i++){
    const m=messages[i];
    for(const call of callInfo(m)){
      if(call.id) pending.set(call.id,call);
      if(call.path&&WRITE_NAMES.has(call.name)) invalidatedAt.set(normalizePath(call.path),i);
    }
    if(m?.role!=='tool') continue;
    const call=pending.get(m.tool_call_id);
    const name=String(m.name||call?.name||'').toLowerCase();
    const path=normalizePath(call?.path||'');
    if(!path) continue;
    if(WRITE_NAMES.has(name)){invalidatedAt.set(path,i);lastByPath.delete(path);continue;}
    if(!READ_NAMES.has(name)) continue;
    const text=resultText(m);
    const hash=digest(text);
    const previous=lastByPath.get(path);
    const invalidation=invalidatedAt.get(path)??-1;
    if(previous&&previous.hash===hash&&previous.index>invalidation){
      occurrences.push({index:i,path,hash,bytes:Buffer.byteLength(text,'utf8'),previous:previous.index});
    }
    lastByPath.set(path,{index:i,hash});
  }

  const replace=new Map();
  for(const o of occurrences){
    replace.set(o.index,`[Repeated file read omitted: ${o.path} sha256:${o.hash}; identical to earlier read at message ${o.previous}.]`);
  }
  const output=(messages||[]).map((m,i)=>replace.has(i)?replaceContent(m,replace.get(i)):m);
  return {messages:output,replaced:replace.size,occurrences};
}

module.exports={replaceContent,compactRepeatedFileReads};
