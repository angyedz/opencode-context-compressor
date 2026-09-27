'use strict';

const crypto=require('crypto');
function stable(value){
 if(Array.isArray(value))return value.map(stable);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
 return value;
}
function fingerprint(messages,{count=null}={}){
 const slice=count==null?(messages||[]):(messages||[]).slice(0,count);
 return crypto.createHash('sha256').update(JSON.stringify(stable(slice))).digest('hex').slice(0,24);
}
function cacheKey(sessionKey,{mode='conversation',epoch=0,prefixFingerprint=''}={}){
 const base=String(sessionKey||'default').replace(/[^a-zA-Z0-9_.:-]/g,'_').slice(0,80);
 const fp=String(prefixFingerprint||'').slice(0,12);
 return `occ:${mode}:${base}:e${epoch}:${fp}`;
}
function compare(before,after,{prefixCount}={}){
 const a=fingerprint(before,{count:prefixCount}),b=fingerprint(after,{count:prefixCount});
 return {stable:a===b,before:a,after:b,prefixCount};
}
module.exports={stable,fingerprint,cacheKey,compare};
