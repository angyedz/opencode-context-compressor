'use strict';

function namespace(name){const s=String(name||'');const parts=s.split(/[.:/_-]/).filter(Boolean);return parts.length>1?parts[0]:'general';}
function catalog(tools){
 const groups=new Map();
 for(const tool of tools||[]){
  const name=tool?.function?.name||tool?.name||'unknown',ns=namespace(name);
  if(!groups.has(ns))groups.set(ns,[]);
  groups.get(ns).push(name);
 }
 return [...groups].map(([name,names])=>({namespace:name,count:names.length,examples:names.slice(0,5)})).sort((a,b)=>b.count-a.count||a.namespace.localeCompare(b.namespace));
}
function render(groups,{maxChars=3000}={}){
 let out='### Available tool namespaces\n';
 for(const g of groups||[])out+=`- ${g.namespace}: ${g.count} tools (e.g. ${g.examples.join(', ')})\n`;
 return out.slice(0,maxChars);
}
module.exports={namespace,catalog,render};
