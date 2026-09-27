'use strict';

function classify(error){
 const text=String(error?.message||error||'').toLowerCase();
 const code=String(error?.code||'').toLowerCase();
 if(/context|token/.test(text)&&/(exceed|overflow|too large|length|limit)/.test(text))return {kind:'context-overflow',retryable:true,compact:true};
 if(/network connection lost|connection reset|econnreset|socket hang up/.test(text)||['econnreset','etimedout'].includes(code)){
   if(/context|token|length|limit/.test(text))return {kind:'context-overflow',retryable:true,compact:true,wrappedAsNetwork:true};
   return {kind:'network',retryable:true,compact:false};
 }
 if(/429|rate.?limit|too many requests/.test(text))return {kind:'rate-limit',retryable:true,compact:false};
 if(/401|403|invalid api key|unauthorized|forbidden/.test(text))return {kind:'auth',retryable:false,compact:false};
 return {kind:'unknown',retryable:false,compact:false};
}
function unwrap(error){
 const candidates=[error,error?.cause,error?.error,error?.response?.data,error?.body].filter(Boolean);
 for(const candidate of candidates){
  const c=classify(candidate);
  if(c.kind!=='unknown')return {...c,source:candidate};
 }
 return {...classify(error),source:error};
}
module.exports={classify,unwrap};
