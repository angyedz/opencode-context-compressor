'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const caps=require('../src/context/provider-capabilities');

test('learns served context from request exceeds available context error',()=>{
 caps.clear();
 const parsed=caps.parseContextLimit('exceed_context_size_error: request (8588 tokens) exceeds the available context size (8192 tokens)');
 assert.deepEqual(parsed,{requested:8588,limit:8192,source:'request-exceeds'});
 const learned=caps.learn('lmstudio:model',new Error('request (8588 tokens) exceeds the available context size (8192 tokens)'));
 assert.ok(learned.limit<8192);
 assert.equal(caps.effectiveLimit('lmstudio:model',65536),learned.limit);
});

test('learned limit only tightens and never trusts a later larger configured value',()=>{
 caps.clear();
 caps.learn('p','maximum context length is 16000');
 const first=caps.get('p').limit;
 caps.learn('p','maximum context length is 8192');
 const second=caps.get('p').limit;
 assert.ok(second<first);
 assert.equal(caps.effectiveLimit('p',200000),second);
});
