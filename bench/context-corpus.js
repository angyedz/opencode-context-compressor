'use strict';

function toolHeavy(turns=80){
  const messages=[{role:'system',content:'coding agent'}];
  for(let i=0;i<turns;i++){
    messages.push({role:'user',content:`Run tests for module ${i%7}.`});
    messages.push({role:'assistant',content:'running',tool_calls:[{id:`c${i}`,type:'function',function:{name:'shell',arguments:'{"cmd":"npm test"}'}}]});
    messages.push({role:'tool',name:'shell',tool_call_id:`c${i}`,content:(`12:30:0${i%10} progress\n`).repeat(250)+`PASS module ${i%7}\n`});
    messages.push({role:'assistant',content:`Decision: src/module-${i%7}.js API contract must remain compatible.`});
  }
  messages.push({role:'user',content:'Continue while preserving API compatibility.'});
  return {name:'tool-heavy',messages,anchors:['API contract']};
}

function debugging(turns=40){
  const messages=[];
  messages.push({role:'user',content:'src/api/router.js calls src/auth/middleware.js.'});
  messages.push({role:'assistant',content:'src/auth/middleware.js calls src/auth/session.js validateSession(token).'});
  messages.push({role:'assistant',content:'Error: validateSession(token) failed with ERR_TOKEN_EXPIRED.'});
  for(let i=0;i<turns;i++){
    messages.push({role:'user',content:`investigate attempt ${i}`});
    messages.push({role:'assistant',content:i===turns-1?'TODO preserve refresh ordering.':'Attempted workaround; it failed and did not work.'});
  }
  messages.push({role:'user',content:'Fix src/api/router.js auth flow without breaking refresh behavior.'});
  return {name:'debugging-chain',messages,anchors:['src/auth/session.js','validateSession(token)','ERR_TOKEN_EXPIRED','refresh']};
}

function refactor(turns=50){
  const messages=[];
  for(let i=0;i<turns;i++){
    const file=`src/service/part-${i%5}.js`;
    messages.push({role:'user',content:`Refactor ${file}.`});
    messages.push({role:'assistant',content:`Decision: ${file} public signature must remain unchanged. TODO keep test:service-${i%5} green.`});
  }
  messages.push({role:'user',content:'Finish the refactor and preserve every public signature.'});
  return {name:'refactor',messages,anchors:['public signature','test:service-']};
}

function unicode(turns=45){
  const messages=[];
  for(let i=0;i<turns;i++){
    messages.push({role:'user',content:`Задача ${i}: исправь src/i18n/locale.js, не ломай API. 中文测试。`});
    messages.push({role:'assistant',content:`Решение ${i}: контракт API должен сохраниться. TODO проверить Unicode normalization.`});
  }
  messages.push({role:'user',content:'Продолжи исправление Unicode normalization в src/i18n/locale.js.'});
  return {name:'unicode',messages,anchors:['src/i18n/locale.js','Unicode normalization']};
}

function protocol(){
  const messages=[
    {role:'user',content:'Inspect a.js'},
    {role:'assistant',content:'',tool_calls:[{id:'c1',type:'function',function:{name:'read_file',arguments:'{"path":"a.js"}'}}]},
    {role:'tool',tool_call_id:'c1',name:'read_file',content:'function x(){return 1}'},
    {role:'assistant',content:'Decision: x() signature must stay stable.'},
    {role:'user',content:'Now change implementation only.'},
  ];
  return {name:'protocol',messages,anchors:['x() signature']};
}

function all(){return [toolHeavy(),debugging(),refactor(),unicode(),protocol()];}

module.exports={toolHeavy,debugging,refactor,unicode,protocol,all};
