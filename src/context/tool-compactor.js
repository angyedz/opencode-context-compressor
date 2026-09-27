'use strict';

function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(extractText).filter(Boolean).join('\n');
  if (content && typeof content === 'object') {
    if (typeof content.text === 'string') return content.text;
    if (content.content !== undefined) return extractText(content.content);
  }
  return '';
}

function replaceTextContent(content,nextText){
  if(typeof content==='string') return nextText;
  if(Array.isArray(content)){
    let replaced=false;
    return content.map(part=>{
      if(typeof part==='string'){ if(replaced) return ''; replaced=true; return nextText; }
      if(!part||typeof part!=='object') return part;
      if(typeof part.text==='string'){ if(replaced) return {...part,text:''}; replaced=true; return {...part,text:nextText}; }
      if(typeof part.content==='string'){ if(replaced) return {...part,content:''}; replaced=true; return {...part,content:nextText}; }
      return part;
    });
  }
  if(content&&typeof content==='object'){
    if(typeof content.text==='string') return {...content,text:nextText};
    if(typeof content.content==='string') return {...content,content:nextText};
  }
  return content;
}

function stableFingerprint(text){
  return String(text||'')
    .replace(/\b\d{2}:\d{2}:\d{2}(?:\.\d+)?\b/g,'<time>')
    .replace(/\b\d+(?:\.\d+)?\s*(?:ms|s|sec|seconds)\b/gi,'<duration>')
    .replace(/\bpid\s*[=:]?\s*\d+\b/gi,'pid=<n>')
    .replace(/\/tmp\/[A-Za-z0-9_.-]+/g,'/tmp/<temp>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,'<uuid>')
    .replace(/\b(request|trace|span|session|run)[-_ ]?(?:id)?[=: ]+[A-Za-z0-9_.:-]{8,}\b/gi,'$1-id=<volatile>')
    .replace(/\s+/g,' ')
    .trim()
    .slice(0,16000);
}

function summarizeRepeated(text){
  const lines=String(text||'').split('\n').filter(Boolean);
  if(lines.length<8) return text;
  const counts=new Map();
  for(const line of lines){const key=stableFingerprint(line);counts.set(key,(counts.get(key)||0)+1);}
  const repeated=[...counts.entries()].filter(([,count])=>count>=3).sort((a,b)=>b[1]-a[1]);
  if(!repeated.length) return text;
  const keep=[];
  const emitted=new Set();
  for(const line of lines){
    const key=stableFingerprint(line);
    const count=counts.get(key)||1;
    if(count>=3){
      if(emitted.has(key)) continue;
      emitted.add(key);
      keep.push(line);
      keep.push(`... [same line repeated ${count-1} more times] ...`);
    } else keep.push(line);
  }
  return keep.join('\n');
}

function collapseRepeatedToolOutputs(turns,{isStructured=()=>false}={}){
  const lastSeen=new Map(); const out=[];
  for(let ti=(turns||[]).length-1;ti>=0;ti--){
    const turn=turns[ti];
    const next=turn.map(message=>{
      if(message?.role!=='tool'||isStructured(message)) return message;
      const text=extractText(message.content);
      const compacted=summarizeRepeated(text);
      const key=`${message.name||''}|${stableFingerprint(compacted)}`;
      if(!text||!lastSeen.has(key)){lastSeen.set(key,true);return compacted===text?message:{...message,content:replaceTextContent(message.content,compacted)};}
      return {...message,content:replaceTextContent(message.content,'[Repeated tool output omitted; latest equivalent result retained]')};
    });
    out.unshift(next);
  }
  return out;
}

function detectStateChange(previous,current){
  const a=stableFingerprint(previous),b=stableFingerprint(current);
  if(a===b) return {changed:false,kind:'same'};
  const pass=/\b(pass|passed|success|green|ok)\b/i.test(current);
  const fail=/\b(fail|failed|error|exception|panic)\b/i.test(current);
  return {changed:true,kind:pass?'success':fail?'failure':'changed'};
}

module.exports={extractText,replaceTextContent,stableFingerprint,summarizeRepeated,collapseRepeatedToolOutputs,detectStateChange};
