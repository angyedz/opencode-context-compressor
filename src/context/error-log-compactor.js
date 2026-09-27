'use strict';

function isErrorLog(text){
  return /(?:^|\n)(?:FAIL\b|ERROR\b|Error[: ]|Exception[: ]|Traceback \(|panic[: ]|npm ERR!|Caused by:|AssertionError)/im.test(String(text||''));
}

function lineScore(line){
  const text=String(line||'');
  let score=0;
  if(/\b(?:fatal|panic|assertionerror|exception|error|failed|failure|fail)\b/i.test(text)) score+=12;
  if(/\bcaused by:/i.test(text)) score+=14;
  if(/\b(?:expected|actual|received|wanted)\b/i.test(text)) score+=7;
  if(/\b(?:test|spec)[\w .:/#_-]*(?:failed|fail|✗|×)/i.test(text)) score+=8;
  if(/^\s*at\s+/.test(text)||/^\s*File\s+".+",\s+line\s+\d+/.test(text)) score+=4;
  if(/(?:src|lib|app|test|spec)\/[A-Za-z0-9_./-]+:\d+/.test(text)) score+=5;
  if(/\b(?:passed|tests?|suites?|duration|time|exit code)\b/i.test(text)) score+=2;
  if(/^\s*(?:warn|warning)[: ]/i.test(text)) score+=1;
  return score;
}

function normalizeLine(line){
  return String(line||'')
    .replace(/\b\d{2}:\d{2}:\d{2}(?:\.\d+)?\b/g,'<time>')
    .replace(/\bpid\s*[=:]?\s*\d+\b/gi,'pid=<n>')
    .trimEnd();
}

function selectImportantLines(text,{maxLines=70}={}){
  const lines=String(text||'').split('\n');
  if(lines.length<=maxLines) return lines;

  const picked=new Map();
  const add=(index)=>{if(index>=0&&index<lines.length)picked.set(index,lines[index]);};

  for(let i=0;i<Math.min(8,lines.length);i++) add(i);
  for(let i=Math.max(0,lines.length-12);i<lines.length;i++) add(i);

  const ranked=lines
    .map((line,index)=>({line,index,score:lineScore(line)}))
    .filter(x=>x.score>0)
    .sort((a,b)=>b.score-a.score||a.index-b.index);

  for(const item of ranked){
    if(picked.size>=maxLines) break;
    add(item.index);
    if(item.score>=10){add(item.index-1);add(item.index+1);}
  }

  const ordered=[...picked.entries()].sort((a,b)=>a[0]-b[0]);
  const out=[]; let previous=-1;
  for(const [index,line] of ordered){
    if(previous>=0&&index-previous>1) out.push(`... [${index-previous-1} log lines omitted] ...`);
    out.push(line);
    previous=index;
  }
  return out;
}

function dedupeAdjacent(lines){
  const out=[]; let lastKey=null,count=0,lastLine='';
  const flush=()=>{
    if(lastKey===null)return;
    out.push(lastLine);
    if(count>1) out.push(`... [previous line repeated ${count-1} more times] ...`);
  };
  for(const line of lines||[]){
    const key=normalizeLine(line);
    if(key===lastKey){count++;continue;}
    flush(); lastKey=key;lastLine=line;count=1;
  }
  flush();
  return out;
}

function compactErrorLog(text,{targetChars=3000,maxLines=70}={}){
  if(!isErrorLog(text)) return text;
  let lines=dedupeAdjacent(selectImportantLines(text,{maxLines}));
  let result=lines.join('\n');
  if(result.length<=targetChars) return result;

  const essential=lines.filter(line=>lineScore(line)>=4||line.startsWith('... ['));
  result=essential.join('\n');
  if(result.length<=targetChars) return result;

  const head=Math.floor(targetChars*0.58);
  const tail=Math.max(0,targetChars-head-64);
  return result.slice(0,head)+'\n... [error log compacted to budget] ...\n'+result.slice(-tail);
}

module.exports={isErrorLog,lineScore,normalizeLine,selectImportantLines,dedupeAdjacent,compactErrorLog};
