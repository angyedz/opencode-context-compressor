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

function collectFileReads(messages){
  const pending=new Map();
  const versionByPath=new Map();
  const reads=[];

  for(let i=0;i<(messages||[]).length;i++){
    const m=messages[i];

    for(const call of callInfo(m)){
      if(call.id) pending.set(call.id,call);
      if(call.path&&WRITE_NAMES.has(call.name)){
        const path=normalizePath(call.path);
        versionByPath.set(path,(versionByPath.get(path)||0)+1);
      }
    }

    if(m?.role!=='tool') continue;
    const call=pending.get(m.tool_call_id);
    const name=String(m.name||call?.name||'').toLowerCase();
    const path=normalizePath(call?.path||'');
    if(!path) continue;

    if(WRITE_NAMES.has(name)){
      // A write call already invalidates at invocation time. Only account for
      // result-only write events when no call metadata was observed.
      if(!call) versionByPath.set(path,(versionByPath.get(path)||0)+1);
      continue;
    }
    if(!READ_NAMES.has(name)) continue;

    const text=resultText(m);
    reads.push({
      index:i,
      path,
      version:versionByPath.get(path)||0,
      hash:digest(text),
      bytes:Buffer.byteLength(text,'utf8'),
    });
  }
  return reads;
}

function compactRepeatedFileReads(messages){
  const reads=collectFileReads(messages);
  const newestByIdentity=new Map();

  // Keep the newest exact read for each path/version/content identity because
  // recent context survives bounded selection much more reliably than stale context.
  for(let i=reads.length-1;i>=0;i--){
    const read=reads[i];
    const key=`${read.path}|${read.version}|${read.hash}`;
    if(!newestByIdentity.has(key)) newestByIdentity.set(key,read);
  }

  const replace=new Map();
  const occurrences=[];
  for(const read of reads){
    const key=`${read.path}|${read.version}|${read.hash}`;
    const newest=newestByIdentity.get(key);
    if(!newest||newest.index===read.index) continue;
    occurrences.push({...read,newest:newest.index});
    replace.set(
      read.index,
      `[Older duplicate file read omitted: ${read.path} sha256:${read.hash}; identical fresh copy retained at message ${newest.index}.]`
    );
  }

  const output=(messages||[]).map((m,i)=>replace.has(i)?replaceContent(m,replace.get(i)):m);
  return {messages:output,replaced:replace.size,occurrences,reads};
}

module.exports={replaceContent,collectFileReads,compactRepeatedFileReads};
