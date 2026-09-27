'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const plugin=require('../src/plugin');
const commands=require('../src/commands');
const metrics=require('../src/context/runtime-metrics');

test('plugin applies session input window and records envelope telemetry',()=>{
  const key='plugin-envelope-test';
  commands.executeCommand([{role:'user',content:'$compressor window 12k'}],key);
  commands.executeCommand([{role:'user',content:'$compressor reserve 2k'}],key);
  const messages=[];
  for(let i=0;i<14;i++){
    messages.push({role:'user',content:'old '+i+' '+ 'x'.repeat(900)});
    messages.push({role:'assistant',content:'Decision: src/a.js API contract must stay stable '+ 'y'.repeat(900)});
  }
  messages.push({role:'user',content:'continue src/a.js'});
  const out=plugin.compressAndRecord(messages,key,{});
  assert.equal(out[out.length-1].content,'continue src/a.js');
  const report=metrics.get(key);
  assert.equal(report.envelope.maxInputTokens,12000);
  assert.equal(report.envelope.reserveOutputTokens,2000);
  commands.executeCommand([{role:'user',content:'$reset'}],key);
  metrics.clear(key);
});
