'use strict';

function stableSystemParts(parts){
 const staticParts=[],dynamicParts=[];
 for(const part of parts||[]){
  const kind=part?.kind||part?.type||'static';
  if(['cwd','date','git-status','env','runtime','dynamic'].includes(kind))dynamicParts.push(part);
  else staticParts.push(part);
 }
 return {staticParts,dynamicParts};
}
function sessionPromptPlan(parts,{sessionStarted=false}={}){
 const {staticParts,dynamicParts}=stableSystemParts(parts);
 if(!sessionStarted)return {system:staticParts.concat(dynamicParts),reminders:[]};
 return {
  system:staticParts,
  reminders:dynamicParts.map(p=>({role:'system',ephemeral:true,content:p.content||p.text||String(p.value||'')})),
 };
}
function canonicalizeSkills(skills){
 return [...(skills||[])].map(s=>({name:s.name,description:s.description||'',location:s.location||null})).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
}
module.exports={stableSystemParts,sessionPromptPlan,canonicalizeSkills};
