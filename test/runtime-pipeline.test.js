'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const pipeline=require('../src/context/runtime-pipeline');
const metrics=require('../src/context/runtime-metrics');
const commands=require('../src/commands');

test('request output reserve is inferred across provider body shapes',()=>{
  assert.equal(pipeline.requestOutputReserve({max_tokens:1234}),1234);
  assert.equal(pipeline.requestOutputReserve({max_completion_tokens:2345}),2345);
  assert.equal(pipeline.requestOutputReserve({generationConfig:{maxOutputTokens:3456}}),3456);
  assert.equal(pipeline.requestOutputReserve({}),null);
});

test('shared runtime pipeline records metrics and preserves current turn',()=>{
  const key='runtime-pipeline-test';
  metrics.clear(key);
  const messages=[];
  for(let i=0;i<12;i++){
    messages.push({role:'user',content:'old '+i+' '+ 'x'.repeat(800)});
    messages.push({role:'assistant',content:'Decision: src/a.js API contract must remain stable '+ 'y'.repeat(800)});
  }
  messages.push({role:'user',content:'CURRENT'});
  const result=pipeline.compressAndRecord(messages,key,{requestBody:{max_tokens:1500},maxChars:5000});
  assert.equal(result.messages[result.messages.length-1].content,'CURRENT');
  assert.equal(result.options.reserveOutputTokens,1500);
  assert.ok(metrics.get(key));
});

test('session command budgets flow into shared runtime options',()=>{
  const key='runtime-session-options';
  commands.executeCommand([{role:'user',content:'$compressor tokens 6k'}],key);
  commands.executeCommand([{role:'user',content:'$compressor window 24k'}],key);
  const resolved=pipeline.resolveOptions(key,{});
  assert.equal(resolved.maxTokens,6000);
  assert.equal(resolved.maxInputTokens,24000);
  commands.executeCommand([{role:'user',content:'$reset'}],key);
});
