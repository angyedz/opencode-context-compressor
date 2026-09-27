'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const budget = require('../src/context/token-budget');
const protocol = require('../src/context/protocol-integrity');

test('budget derivation honors the tighter char/token constraint', () => {
  assert.equal(budget.deriveCharBudget({ maxChars: 16000, maxTokens: 2000 }), 6400);
  assert.equal(budget.deriveCharBudget({ maxChars: 5000, maxTokens: 9000 }), 5000);
});

test('budget report is deterministic and exposes utilization', () => {
  const messages=[{role:'user',content:'hello world'}];
  assert.deepEqual(budget.budgetReport(messages,{maxChars:4000,maxTokens:1000}), budget.budgetReport(messages,{maxChars:4000,maxTokens:1000}));
});

test('Gemini orphan functionResponse is rejected', () => {
  const report=protocol.validateToolProtocol([{role:'user',content:[{functionResponse:{name:'read_file',response:{ok:true}}}]}]);
  assert.equal(report.valid,false);
});

test('Gemini function call followed by matching response is valid', () => {
  const report=protocol.validateToolProtocol([
    {role:'assistant',content:[{functionCall:{name:'read_file',args:{path:'a.js'}}}]},
    {role:'user',content:[{functionResponse:{name:'read_file',response:{result:'ok'}}}]},
  ]);
  assert.equal(report.valid,true);
});

test('assertToolProtocol attaches a machine-readable failure report', () => {
  assert.throws(
    () => protocol.assertToolProtocol([{role:'tool',tool_call_id:'missing',content:'oops'}]),
    (error) => error.code === 'ERR_CONTEXT_TOOL_PROTOCOL' && error.report.openai.orphanResults.length === 1
  );
});
