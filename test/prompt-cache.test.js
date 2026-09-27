'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const identity=require('../src/context/prompt-cache-identity');
const {CacheBustMonitor}=require('../src/context/cache-bust-monitor');
const {PrefixGuard}=require('../src/context/prefix-guard');

test('compaction uses a distinct cache namespace from normal conversation',()=>{
 const fp=identity.fingerprint([{role:'user',content:'hello'}]);
 const a=identity.cacheKey('s',{mode:'conversation',epoch:2,prefixFingerprint:fp});
 const b=identity.cacheKey('s',{mode:'compaction',epoch:2,prefixFingerprint:fp});
 assert.notEqual(a,b);
});

test('prefix guard detects mutation of already cached historical tool output',()=>{
 const before=[{role:'user',content:'x'},{role:'tool',tool_call_id:'1',content:'pending'}];
 const guard=new PrefixGuard();guard.freeze('s',before,2);
 const after=[{role:'user',content:'x'},{role:'tool',tool_call_id:'1',content:'completed output'}];
 const r=guard.verify('s',after);assert.equal(r.valid,false);assert.equal(r.reason,'historical-prefix-mutated');
});

test('cache bust monitor warns on production-like 22.5 percent bust rate',()=>{
 const m=new CacheBustMonitor({windowSize:40,warnRate:0.15,minSamples:8});
 let stats;
 for(let i=0;i<40;i++)stats=m.record('s',{inputTokens:250000,cacheReadTokens:i<9?0:240000,cacheWriteTokens:i<9?250000:1000});
 assert.equal(stats.busts,9);assert.equal(stats.rate,0.225);assert.equal(stats.warn,true);
});
