'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const plugin=require('../src/plugin');
const metrics=require('../src/context/runtime-metrics');

test('compressAndRecord stores content-free metrics for a session',()=>{
  metrics.clear('metrics-test');
  const messages=[];
  for(let i=0;i<10;i++){
    messages.push({role:'user',content:'old '+i+' '+ 'x'.repeat(800)});
    messages.push({role:'assistant',content:'Decision: API contract must remain stable '+ 'y'.repeat(800)});
  }
  messages.push({role:'user',content:'current'});
  const out=plugin.compressAndRecord(messages,'metrics-test',{maxChars:4000});
  assert.equal(out[out.length-1].content,'current');
  const r=metrics.get('metrics-test');
  assert.ok(r);
  assert.ok(r.before.tokens>=r.after.tokens);
  assert.equal(r.quality.protocolValid,true);
});
