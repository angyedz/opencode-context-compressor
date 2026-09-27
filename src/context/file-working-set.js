'use strict';

const {normalizePath,digest}=require('./file-read-cache');

const READ_NAMES=new Set(['read','read_file','readfile','file_read','fs_read','cat']);
const WRITE_NAMES=new Set(['write','write_file','writefile','edit','edit_file','patch','apply_patch','fs_write']);

function parseArgs(raw){
  if(!raw)return {};
  if(typeof raw==='object')return raw;
  try{return JSON.parse(raw);}catch(_){return {};}
}
function pathFromArgs(args){
  const a=parseArgs(args);
  return normalizePath(a.path||a.file||a.file_path||a.filename||a.target||'');
}
function callInfo(message){
  const out=[];
  for(const call of message?.tool_calls||[]){
    const name=String(call?.function?.name||'').toLowerCase();
    out.push({id:call?.id||null,name,path:pathFromArgs(call?.function?.arguments)});
  }
  if(message?.function_call){
    const name=String(message.function_call.name||'').toLowerCase();
    out.push({id:null,name,path:pathFromArgs(message.function_call.arguments)});
  }
  for(const part of Array.isArray(message?.content)?message.content:[]){
    if(part?.type==='tool_use') out.push({id:part.id||null,name:String(part.name||'').toLowerCase(),path:pathFromArgs(part.input)});
    if(part?.functionCall) out.push({id:null,name:String(part.functionCall.name||'').toLowerCase(),path:pathFromArgs(part.functionCall.args)});
  }
  return out;
}
function resultText(message){
  if(typeof message?.content==='string')return message.content;
  if(Array.isArray(message?.content))return message.content.map(p=>p?.text||p?.content||'').join('\n');
  return '';
}
function buildWorkingSet(messages,{maxFiles=64}={}){
  const pending=new Map(),files=new Map();
  for(let i=0;i<(messages||[]).length;i++){
    const m=messages[i];
    for(const call of callInfo(m)){
      if(call.id) pending.set(call.id,call);
      if(WRITE_NAMES.has(call.name)&&call.path) files.delete(call.path);
    }
    if(m?.role==='tool'){
      const call=pending.get(m.tool_call_id);
      const name=String(m.name||call?.name||'').toLowerCase();
      const path=call?.path||'';
      if(READ_NAMES.has(name)&&path){
        const text=resultText(m);
        files.delete(path);
        files.set(path,{path,digest:digest(text),bytes:Buffer.byteLength(text,'utf8'),lastReadIndex:i,tool:name});
      }
      if(WRITE_NAMES.has(name)&&path) files.delete(path);
    }
  }
  const list=[...files.values()].slice(-maxFiles);
  return {files:list,byPath:new Map(list.map(x=>[x.path,x]))};
}
function duplicateReadReference(messages,call){
  if(!call?.path||!READ_NAMES.has(String(call.name||'').toLowerCase()))return null;
  const ws=buildWorkingSet(messages);
  const known=ws.byPath.get(normalizePath(call.path));
  if(!known)return null;
  return `[Working-set hit: ${known.path} sha256:${known.digest} ${known.bytes}B was already read and has not been invalidated by an observed write. Reuse prior content unless freshness is required.]`;
}
function renderWorkingSet(messages,{maxFiles=12}={}){
  const ws=buildWorkingSet(messages,{maxFiles});
  if(!ws.files.length)return '';
  return ['### File working-set',...ws.files.map(f=>`- ${f.path} sha256:${f.digest} ${f.bytes}B`)].join('\n');
}
module.exports={READ_NAMES,WRITE_NAMES,parseArgs,pathFromArgs,callInfo,resultText,buildWorkingSet,duplicateReadReference,renderWorkingSet};
