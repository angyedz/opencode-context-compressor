'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {classify,unwrap}=require('../src/context/error-classifier');
const {STATES,transition,ContinuityMachine}=require('../src/context/continuity-machine');
const validator=require('../src/context/compaction-validator');

test('wrapped provider context overflow is not misclassified as ordinary network failure',()=>{
 const err={message:'Network connection lost',cause:{message:'context length exceeded: too many tokens'}};
 const c=unwrap(err);
 assert.equal(c.kind,'context-overflow');
 assert.equal(c.compact,true);
});

test('auth failures never trigger compaction recovery',()=>{
 const c=classify(new Error('401 invalid api key'));
 assert.equal(c.kind,'auth');assert.equal(c.compact,false);assert.equal(c.retryable,false);
});

test('headless run resumes after successful compaction even if compaction accounting says overflow',()=>{
 const m=new ContinuityMachine();
 assert.equal(m.send('s','overflow').state,STATES.COMPACTING);
 assert.equal(m.send('s','compaction-valid').state,STATES.RESUME);
 const next=m.send('s','overflow-accounting');
 assert.equal(next.state,STATES.RUNNING);
 assert.equal(next.action,'continue');
});

test('compaction validator rejects unsupported invented concrete entities',()=>{
 const source=[{role:'assistant',content:'src/a.js ERR_REAL'}];
 const summary={role:'assistant',content:'Summary '.repeat(20)+'src/fake.js ERR_INVENTED'};
 const r=validator.validate(summary,source,{sourceChars:1000});
 assert.equal(r.valid,false);
 assert.equal(validator.decision(r).action,'rollback');
});
