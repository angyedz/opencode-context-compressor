'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {collectRankedAnchorRecords}=require('../src/compressor');

test('ranked anchor records expose source provenance and score reasons',()=>{
  const turns=[
    [{role:'user',content:'Implement src/auth/session.js.'}],
    [{role:'assistant',content:'Error: src/auth/session.js validateSession(token) failed regression test. TODO preserve API contract.'}],
  ];
  const records=collectRankedAnchorRecords(turns,'Fix src/auth/session.js validateSession(token)',8);
  assert.ok(records.length>0);
  assert.ok(records.some(r=>r.sourceRole==='assistant'));
  assert.ok(records.some(r=>Array.isArray(r.reasons)&&r.reasons.length>0));
  assert.ok(records.every(r=>typeof r.score==='number'));
});
