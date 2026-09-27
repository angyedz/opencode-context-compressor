'use strict';

const crypto=require('crypto');
const FILES=['AGENTS.md','CLAUDE.md','CONTRIBUTING.md','.cursorrules'];

function hash(text){return crypto.createHash('sha256').update(String(text||'')).digest('hex').slice(0,16);}
function normalizePath(path){return String(path||'').replace(/\\/g,'/');}
function isInstructionFile(path){const p=normalizePath(path);return FILES.some(name=>p===name||p.endsWith('/'+name));}
function extractRules(text,{maxRules=80}={}){
 const lines=String(text||'').split(/\r?\n/),rules=[];
 for(const raw of lines){
  const line=raw.trim();
  if(!line||line.startsWith('~~~')||line.length<4)continue;
  if(/^[-*]\s+/.test(line)||/^\d+[.)]\s+/.test(line)||/\b(must|never|always|do not|required|should|shall|нельзя|всегда|обязательно)\b/i.test(line)){
   rules.push(line.replace(/^[-*]\s+/,'').slice(0,500));
  }
  if(rules.length>=maxRules)break;
 }
 return [...new Set(rules)];
}
function build(files){
 const entries=[];
 for(const file of files||[]){
  if(!isInstructionFile(file.path))continue;
  const rules=extractRules(file.content);
  entries.push({path:normalizePath(file.path),hash:hash(file.content),rules});
 }
 return {entries,count:entries.length,rules:entries.reduce((n,e)=>n+e.rules.length,0)};
}
function render(registry,{maxChars=6000}={}){
 if(!registry?.entries?.length)return '';
 let out='### Project instructions preserved across compaction\n';
 for(const entry of registry.entries){
  out+=`[${entry.path} sha256:${entry.hash}]\n`;
  for(const rule of entry.rules)out+=`- ${rule}\n`;
  if(out.length>=maxChars)break;
 }
 return out.slice(0,maxChars);
}
module.exports={FILES,hash,normalizePath,isInstructionFile,extractRules,build,render};
