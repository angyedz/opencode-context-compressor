'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const inv=require('../src/context/invariants');

test('context invariants accept preserved system/current turn and valid protocol',()=>{
 const input=[{role:'system',content:'rules'},{role:'user',content:'old'},{role:'assistant',content:'reply'},{role:'user',content:'current'}];
 const output=[{role:'system',content:'rules'},{role:'user',content:'summary'},{role:'user',content:'current'}];
 const r=inv.evaluate(input,output,{maxChars:5000,maxTokens:2000});
 assert.equal(r.valid,true);
});

test('context invariants detect current-user mutation and lost system message',()=>{
 const input=[{role:'system',content:'rules'},{role:'user',content:'current'}];
 const output=[{role:'user',content:'changed'}];
 const r=inv.evaluate(input,output);
 assert.equal(r.valid,false);
 assert.equal(r.checks.currentUserExact,false);
 assert.equal(r.checks.systemMessagesPreserved,false);
 assert.throws(()=>inv.assert(input,output),e=>e.code==='ERR_CONTEXT_INVARIANT');
});

test('finite payload rejects undefined and non-finite numeric values',()=>{
 assert.equal(inv.finitePayload({a:1,b:['ok']}),true);
 assert.equal(inv.finitePayload({a:undefined}),false);
 assert.equal(inv.finitePayload({a:Infinity}),false);
});
