'use strict';

function normalizeFact(text){
 return String(text||'').toLowerCase().replace(/\b\d+(?:\.\d+)?\b/g,'<n>').replace(/\s+/g,' ').trim();
}
function polarity(text){
 const t=String(text||'').toLowerCase();
 if(/\b(not|never|no longer|cannot|can't|must not|disabled|removed|deprecated|failed|broken)\b/.test(t))return -1;
 if(/\b(must|always|required|enabled|fixed|resolved|works|supported|use)\b/.test(t))return 1;
 return 0;
}
function subject(text){
 return normalizeFact(text)
  .replace(/\b(not|never|no longer|cannot|can't|must not|disabled|removed|deprecated|failed|broken|must|always|required|enabled|fixed|resolved|works|supported|use)\b/g,'')
  .replace(/\s+/g,' ').trim();
}
function reconcile(facts){
 const newest=new Map(),conflicts=[];
 for(let i=(facts||[]).length-1;i>=0;i--){
  const fact=String(facts[i]||'').trim();if(!fact)continue;
  const key=subject(fact),p=polarity(fact);
  if(!newest.has(key)){newest.set(key,{fact,index:i,polarity:p});continue;}
  const current=newest.get(key);
  if(p&&current.polarity&&p!==current.polarity)conflicts.push({subject:key,older:fact,newer:current.fact});
 }
 return {facts:[...newest.values()].sort((a,b)=>a.index-b.index).map(x=>x.fact),conflicts};
}
module.exports={normalizeFact,polarity,subject,reconcile};
