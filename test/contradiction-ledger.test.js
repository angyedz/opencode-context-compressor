'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const ledger=require('../src/context/contradiction-ledger');

test('ledger keeps newest value and records superseded conflict',()=>{
  const out=ledger.resolveRecords([
    {fact:'Decision: src/server/config.js port must be 8080.',recency:1,score:20,topic:'src/server/config.js'},
    {fact:'Decision: src/server/config.js port must be 3000.',recency:5,score:18,topic:'src/server/config.js'},
  ]);
  assert.equal(out.active.length,1);
  assert.match(out.active[0].fact,/8080/);
  assert.equal(out.superseded.length,1);
  assert.equal(out.conflicts.length,1);
});

test('ledger stats expose conflict pressure',()=>{
  const out=ledger.resolveRecords([
    {fact:'src/a.js timeout must be 20s',recency:1,topic:'src/a.js'},
    {fact:'src/a.js timeout must be 10s',recency:2,topic:'src/a.js'},
  ]);
  const stats=ledger.ledgerStats(out);
  assert.equal(stats.topics,1);
  assert.equal(stats.conflicts,1);
});
