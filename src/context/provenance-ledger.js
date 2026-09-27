'use strict';

const crypto=require('crypto');

function digest(value){
  return crypto.createHash('sha256').update(String(value||'')).digest('hex').slice(0,16);
}

function textOf(content){
  if(typeof content==='string') return content;
  if(Array.isArray(content)) return content.map(textOf).filter(Boolean).join('\n');
  if(content&&typeof content==='object'){
    if(typeof content.text==='string') return content.text;
    if(content.content!==undefined) return textOf(content.content);
  }
  return '';
}

function messageRecord(message,index){
  const text=textOf(message?.content);
  return {
    index,
    role:message?.role||'unknown',
    name:message?.name||null,
    chars:text.length,
    digest:digest(text),
    structured:Array.isArray(message?.content)&&message.content.some(p=>p&&typeof p==='object'&&p.type&&p.type!=='text'),
    toolCallIds:(message?.tool_calls||[]).map(c=>c?.id).filter(Boolean),
    toolResultId:message?.tool_call_id||null,
  };
}

function buildLedger(messages){
  return (messages||[]).map(messageRecord);
}

function diffLedgers(before,after){
  const afterKeys=new Set((after||[]).map(x=>`${x.role}:${x.digest}`));
  const beforeKeys=new Set((before||[]).map(x=>`${x.role}:${x.digest}`));
  return {
    retained:(before||[]).filter(x=>afterKeys.has(`${x.role}:${x.digest}`)).length,
    removed:(before||[]).filter(x=>!afterKeys.has(`${x.role}:${x.digest}`)).length,
    synthesized:(after||[]).filter(x=>!beforeKeys.has(`${x.role}:${x.digest}`)).length,
    before:(before||[]).length,
    after:(after||[]).length,
  };
}

function verifyCurrentUser(beforeMessages,afterMessages){
  const lastUser=(messages)=>{
    for(let i=(messages||[]).length-1;i>=0;i--) if(messages[i]?.role==='user') return messageRecord(messages[i],i);
    return null;
  };
  const a=lastUser(beforeMessages),b=lastUser(afterMessages);
  return !!a&&!!b&&a.digest===b.digest&&a.chars===b.chars;
}

module.exports={digest,textOf,messageRecord,buildLedger,diffLedgers,verifyCurrentUser};
