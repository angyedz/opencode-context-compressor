'use strict';

function isDiff(text){
  const source=String(text||'');
  return source.includes('diff --git ')||(/(^|\n)---\s+\S+/.test(source)&&/(^|\n)\+\+\+\s+\S+/.test(source));
}

function parseDiff(text){
  const lines=String(text||'').split('\n');
  const files=[];
  let file=null;
  let hunk=null;

  const ensureFile=()=>{
    if(!file){file={header:'diff',meta:[],hunks:[]};files.push(file);}
    return file;
  };

  for(const line of lines){
    if(line.startsWith('diff --git ')){
      file={header:line,meta:[],hunks:[]};
      files.push(file); hunk=null; continue;
    }
    if(line.startsWith('@@')){
      const f=ensureFile();
      hunk={header:line,lines:[]};
      f.hunks.push(hunk); continue;
    }
    if(hunk){hunk.lines.push(line);continue;}
    if(file&&(line.startsWith('--- ')||line.startsWith('+++ ')||line.startsWith('index ')||line.startsWith('new file')||line.startsWith('deleted file')||line.startsWith('rename '))){
      file.meta.push(line);
    }
  }
  return files;
}

function lineImportance(line){
  if(!line||(!line.startsWith('+')&&!line.startsWith('-'))) return 0;
  if(line.startsWith('+++')||line.startsWith('---')) return 0;
  let score=1;
  if(/\b(error|throw|panic|todo|fixme|return|await|async|function|class|def|interface|type|export|import)\b/i.test(line)) score+=4;
  if(/[A-Za-z_$][A-Za-z0-9_$]*\([^)]{0,100}\)/.test(line)) score+=3;
  if(/\b(if|else|for|while|switch|case|try|catch)\b/.test(line)) score+=1;
  return score;
}

function selectHunkLines(lines,maxLines=10){
  const changed=lines
    .map((line,index)=>({line,index,score:lineImportance(line)}))
    .filter(x=>x.score>0);
  if(changed.length<=maxLines) return changed.map(x=>x.line);

  const selected=new Map();
  for(const item of changed.slice(0,2)) selected.set(item.index,item.line);
  for(const item of changed.slice(-2)) selected.set(item.index,item.line);
  const ranked=[...changed].sort((a,b)=>b.score-a.score||a.index-b.index);
  for(const item of ranked){
    if(selected.size>=maxLines) break;
    selected.set(item.index,item.line);
  }

  const ordered=[...selected.entries()].sort((a,b)=>a[0]-b[0]);
  const out=[]; let previous=-1;
  for(const [index,line] of ordered){
    if(previous>=0&&index-previous>1) out.push(`... [${index-previous-1} changed lines omitted] ...`);
    out.push(line); previous=index;
  }
  return out;
}

function compactDiff(text,{targetChars=3000,maxFiles=12,maxHunksPerFile=12,maxLinesPerHunk=10}={}){
  if(!isDiff(text)) return text;
  const files=parseDiff(text);
  if(!files.length) return text;
  const out=[];

  for(const file of files.slice(0,maxFiles)){
    out.push(file.header);
    out.push(...file.meta);
    for(const hunk of file.hunks.slice(0,maxHunksPerFile)){
      out.push(hunk.header);
      out.push(...selectHunkLines(hunk.lines,maxLinesPerHunk));
    }
    if(file.hunks.length>maxHunksPerFile) out.push(`... [${file.hunks.length-maxHunksPerFile} hunks omitted] ...`);
  }
  if(files.length>maxFiles) out.push(`... [${files.length-maxFiles} files omitted] ...`);

  let result=out.join('\n');
  if(result.length>targetChars){
    const lines=result.split('\n');
    const headers=lines.filter(line=>line.startsWith('diff --git ')||line.startsWith('@@')||line.startsWith('--- ')||line.startsWith('+++ '));
    const essential=headers.join('\n');
    if(essential.length<=targetChars) {
      const room=targetChars-essential.length-48;
      const changes=lines.filter(line=>(line.startsWith('+')||line.startsWith('-'))&&!line.startsWith('+++')&&!line.startsWith('---'));
      result=essential+(room>0?'\n'+changes.join('\n').slice(0,room):'');
    } else {
      result=essential.slice(0,targetChars);
    }
  }
  return result;
}

module.exports={isDiff,parseDiff,lineImportance,selectHunkLines,compactDiff};
