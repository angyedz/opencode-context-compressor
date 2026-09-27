'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const awareness=require('../src/context/compaction-awareness');
const pipeline=require('../src/context/runtime-pipeline');
const metrics=require('../src/context/runtime-metrics');

test('compaction awareness increments epochs and exposes continuity signal',()=>{
  const key='awareness-unit';
  awareness.clear(key);
  const first=awareness.record(key,{before:{tokens:1000},after:{tokens:300},savings:{tokens:700},quality:{score:95}});
  const second=awareness.record(key,{before:{tokens:900},after:{tokens:250},savings:{tokens:650},quality:{score:96}});
  assert.equal(first.epoch,1);
  assert.equal(second.epoch,2);
  const signal=awareness.systemSignal(key);
  assert.match(signal.content,/Compaction epoch 2/);
  assert.match(signal.content,/650 tokens were removed/);
});

test('runtime pipeline records awareness only when tokens were actually saved',()=>{
  const key='awareness-runtime';
  awareness.clear(key);
  metrics.clear(key);

  const short=[
    {role:'user',content:'hello'},
    {role:'assistant',content:'hi'},
    {role:'user',content:'continue'},
  ];
  pipeline.compressAndRecord(short,key,{maxChars:16000});
  const afterShort=awareness.snapshot(key).epoch;

  const long=[];
  for(let i=0;i<30;i++){
    long.push({role:'user',content:'old '+i+' '+ 'x'.repeat(1500)});
    long.push({role:'assistant',content:'Decision: src/a.js API contract stays stable '+ 'y'.repeat(1500)});
  }
  long.push({role:'user',content:'continue src/a.js'});
  pipeline.compressAndRecord(long,key,{maxChars:5000});
  const afterLong=awareness.snapshot(key).epoch;

  assert.ok(afterLong>afterShort);
  awareness.clear(key);
  metrics.clear(key);
});

test('awareness clear resets epoch to zero',()=>{
  const key='awareness-clear';
  awareness.record(key,{before:{tokens:100},after:{tokens:50},savings:{tokens:50},quality:{score:100}});
  awareness.clear(key);
  assert.equal(awareness.snapshot(key).epoch,0);
});
