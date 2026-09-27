'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const metrics=require('../src/context/runtime-metrics');

test('runtime metrics are bounded and aggregate numeric savings only',()=>{
  metrics.clear();
  for(let i=0;i<80;i++){
    metrics.touch('s'+i,{
      before:{tokens:100},after:{tokens:25},savings:{tokens:75},quality:{score:95}
    });
  }
  const aggregate=metrics.aggregate();
  assert.ok(aggregate.sessions<=64);
  assert.ok(aggregate.savedTokens>0);
  assert.equal(typeof aggregate.averageQuality,'number');
});

test('runtime metrics can clear one session independently',()=>{
  metrics.clear();
  metrics.touch('a',{before:{tokens:10},after:{tokens:5},savings:{tokens:5},quality:{score:100}});
  metrics.touch('b',{before:{tokens:10},after:{tokens:5},savings:{tokens:5},quality:{score:100}});
  metrics.clear('a');
  assert.equal(metrics.get('a'),null);
  assert.ok(metrics.get('b'));
});


test('runtime metrics replace the previous sample for the same session',()=>{
  metrics.clear();
  metrics.touch('same',{before:{tokens:100},after:{tokens:50},savings:{tokens:50},quality:{score:90}});
  metrics.touch('same',{before:{tokens:200},after:{tokens:20},savings:{tokens:180},quality:{score:99}});
  assert.equal(metrics.aggregate().sessions,1);
  assert.equal(metrics.get('same').savings.tokens,180);
  assert.equal(metrics.aggregate().savedTokens,180);
  metrics.clear();
});
