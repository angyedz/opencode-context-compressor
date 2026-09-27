'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {IncrementalTranscriptIndex}=require('../src/context/incremental-transcript-index');
const {ProjectionCache}=require('../src/context/projection-cache');
const {DeltaBatcher}=require('../src/context/delta-batcher');
const {MonotonicContextAssembler}=require('../src/context/monotonic-context-assembler');
const {RetryCircuitBreaker}=require('../src/context/retry-circuit-breaker');
const completion=require('../src/context/completion-classifier');

test('300k-token-style session index only processes appended durable sequence',()=>{
 const idx=new IncrementalTranscriptIndex({maxMessages:1000});
 const base=Array.from({length:900},(_,i)=>({seq:i,role:'assistant',content:'x'.repeat(1000)}));
 assert.equal(idx.update('s',base).appended.length,900);
 assert.equal(idx.update('s',[...base,{seq:900,role:'user',content:'new'}]).appended.length,1);
});

test('projection cache remains byte bounded under many large projections',()=>{
 const c=new ProjectionCache({maxEntries:10,maxBytes:10000});
 for(let i=0;i<100;i++)c.set('p'+i,i,{text:'x'.repeat(3000)});
 assert.ok(c.stats().bytes<=10000);assert.ok(c.stats().entries<=10);
});

test('delta batcher bounds event accumulation before flush',()=>{
 const b=new DeltaBatcher({maxItems:4,maxBytes:100000,flushMs:99999});
 let r;for(let i=0;i<4;i++)r=b.add('s',{i});
 assert.equal(r.flush,true);assert.equal(b.take('s').length,4);
});

test('config reload cannot drop a prompt already committed by durable sequence',()=>{
 const a=new MonotonicContextAssembler();
 a.commit('s',[{seq:1,role:'user',content:'first'}],{configVersion:'a'});
 a.commit('s',[{seq:2,role:'user',content:'during reload'}]);
 a.reloadConfig('s','b');
 const s=a.snapshot('s');assert.equal(s.messages.length,2);assert.equal(s.messages[1].content,'during reload');
});

test('retry circuit breaker stops unbounded exponential retries',()=>{
 const b=new RetryCircuitBreaker({maxRetries:3,baseDelayMs:10,cooldownMs:1000});
 assert.equal(b.next('p').allow,true);assert.equal(b.next('p').allow,true);assert.equal(b.next('p').allow,true);
 const stop=b.next('p');assert.equal(stop.allow,false);assert.equal(stop.state,'open');
});

test('max_tokens completion is recorded as incomplete context state',()=>{
 const r=completion.classify({finishReason:'max_tokens',outputTokens:32000,advertisedMaxOutput:32000,text:'half answer'});
 assert.equal(r.state,'incomplete');assert.equal(r.continuationNeeded,true);assert.match(completion.marker(r),/Do not treat/);
});
