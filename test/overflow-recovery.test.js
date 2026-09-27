'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const r=require('../src/context/overflow-recovery');

test('overflow recovery learns provider limit and emits emergency retry options',()=>{
 const out=r.learnAndPlan('local:model','request (8588 tokens) exceeds the available context size (8192 tokens)',0,{beforeTokens:9000,afterTokens:7000});
 assert.equal(out.decision.retry,true);
 assert.equal(out.decision.action,'emergency-compact');
 assert.ok(out.options.maxInputTokens<8192);
});

test('overflow recovery refuses infinite retries after ineffective reduction',()=>{
 const err='request (8588 tokens) exceeds the available context size (8192 tokens)';
 const out=r.policy({attempt:2,beforeTokens:9000,afterTokens:8500,error:err});
 assert.equal(out.retry,false);
 assert.equal(out.action,'stop');
 assert.equal(out.reason,'ineffective-reduction');
});

test('non-context provider failures are propagated instead of hidden',()=>{
 const out=r.policy({attempt:0,error:new Error('401 invalid api key')});
 assert.equal(out.action,'propagate');
 assert.equal(out.retry,false);
});
