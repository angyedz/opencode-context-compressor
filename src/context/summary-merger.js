'use strict';

function mergeSummaries(summaries,{dedupe=true,maxChars=32000}={}){
 const lines=[],seen=new Set();
 for(const summary of summaries||[]){
  const text=typeof summary==='string'?summary:String(summary?.content||'');
  for(const raw of text.split(/\r?\n/)){
   const line=raw.trim();if(!line)continue;
   const key=line.toLowerCase().replace(/\s+/g,' ');
   if(dedupe&&seen.has(key))continue;
   seen.add(key);lines.push(line);
  }
 }
 let out=lines.join('\n');
 if(out.length>maxChars){
  const kept=[];let used=0;
  for(let i=lines.length-1;i>=0;i--){const cost=lines[i].length+1;if(used+cost>maxChars)continue;kept.unshift(lines[i]);used+=cost;}
  out=kept.join('\n');
 }
 return out;
}
function coverage(children,parent){
 const childLines=new Set((children||[]).flatMap(x=>String(x?.content||x||'').split(/\r?\n/).map(y=>y.trim().toLowerCase()).filter(Boolean)));
 const p=String(parent||'').toLowerCase();let found=0;
 for(const line of childLines)if(line.length>=12&&p.includes(line))found++;
 return {found,total:childLines.size,ratio:childLines.size?found/childLines.size:1};
}
module.exports={mergeSummaries,coverage};
