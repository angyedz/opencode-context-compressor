'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const p=require('../src/context/provenance-ledger');

test('provenance ledger tracks retained removed and synthesized messages without content',()=>{
 const before=[{role:'user',content:'secret old'},{role:'assistant',content:'reply'},{role:'user',content:'current'}];
 const after=[{role:'user',content:'summary'},{role:'user',content:'current'}];
 const a=p.buildLedger(before),b=p.buildLedger(after),diff=p.diffLedgers(a,b);
 assert.equal(diff.retained,1); assert.equal(diff.removed,2); assert.equal(diff.synthesized,1);
 assert.doesNotMatch(JSON.stringify(a),/secret old/);
 assert.equal(p.verifyCurrentUser(before,after),true);
});

test('current user verification detects accidental mutation',()=>{
 assert.equal(p.verifyCurrentUser([{role:'user',content:'abc'}],[{role:'user',content:'abcd'}]),false);
});
