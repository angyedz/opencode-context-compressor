'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const r=require('../src/context/relevance-engine');
const g=require('../src/context/semantic-graph');

test('detailed relevance explains exact entity and failure bonuses',()=>{
  const turns=[[{role:'assistant',content:'src/api/router.js uses src/auth/session.js validateSession(token).'}]];
  const distances=g.dependencyDistances(g.buildDependencyGraph(turns),'fix src/api/router.js',2);
  const scored=r.scoreFactDetailed('Error: src/auth/session.js validateSession(token) failed regression test.','fix src/api/router.js',{dependencyDistances:distances,recency:1});
  assert.ok(scored.score>10);
  const names=scored.reasons.map(x=>x.name);
  assert.ok(names.includes('failure'));
  assert.ok(names.includes('dependency-hop-1')||names.includes('exact-entity'));
  assert.match(r.summarizeReasons(scored),/failure\+7/);
});

test('relevance scoring is deterministic',()=>{
  const args=['Decision: src/a.js API contract must remain compatible.','continue src/a.js',{recency:2}];
  assert.deepEqual(r.scoreFactDetailed(...args),r.scoreFactDetailed(...args));
});
