'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const e=require('../src/context/envelope-budget');
const {compressMessages}=require('../src/compressor');

test('envelope reserves system active turn and output before history',()=>{
  const plan=e.planInputEnvelope({
    maxInputTokens:8000,
    reserveOutputTokens:2000,
    systemMessages:[{role:'system',content:'s'.repeat(1000)}],
    activeTurn:[{role:'user',content:'u'.repeat(1000)}],
    directiveTokens:200,
    requestedHistoryTokens:7000,
  });
  assert.equal(plan.bounded,true);
  assert.ok(plan.availableHistoryTokens<7000);
  assert.ok(plan.headroomTokens>=0);
});

test('overcommitted envelope gives history zero instead of truncating active turn',()=>{
  const current='CURRENT '+ 'z'.repeat(12000);
  const messages=[];
  for(let i=0;i<12;i++){
    messages.push({role:'user',content:'old '+i+' '+ 'x'.repeat(1000)});
    messages.push({role:'assistant',content:'old reply '+i+' '+ 'y'.repeat(1000)});
  }
  messages.push({role:'user',content:current});
  const out=compressMessages(messages,{maxChars:16000,maxInputTokens:2000,reserveOutputTokens:1000});
  assert.equal(out[out.length-1].content,current);
});

test('history char conversion respects explicit upper bound',()=>{
  const plan={bounded:true,availableHistoryTokens:5000};
  assert.equal(e.historyCharBudgetFromEnvelope(plan,{maxChars:4000}),4000);
});
