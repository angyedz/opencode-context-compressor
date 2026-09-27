'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const c=require('../src/context/token-calibration');

test('calibration learns bounded provider/model factor with EWMA',()=>{
  c.clear();
  const first=c.record('api.example','model-x',1000,1500);
  assert.equal(first.samples,1);
  assert.equal(first.factor,1.5);
  const second=c.record('api.example','model-x',1000,1000);
  assert.equal(second.samples,2);
  assert.ok(second.factor<1.5&&second.factor>1);
});

test('calibration never stores message content and remains bounded',()=>{
  c.clear();
  for(let i=0;i<150;i++) c.record('p'+i,'m',100,120);
  const rows=c.stats();
  assert.ok(rows.length<=c.MAX_KEYS);
  assert.doesNotMatch(JSON.stringify(rows),/message|content/i);
});

test('usage extraction supports OpenAI Anthropic and Gemini shapes',()=>{
  assert.equal(c.extractActualPromptTokens({usage:{prompt_tokens:111}}),111);
  assert.equal(c.extractActualPromptTokens({usage:{input_tokens:222}}),222);
  assert.equal(c.extractActualPromptTokens({usageMetadata:{promptTokenCount:333}}),333);
});

test('usage extraction can read SSE data lines',()=>{
  const text='data: {"usage":{"prompt_tokens":321}}\n\ndata: [DONE]\n\n';
  assert.equal(c.extractUsageFromText(text),321);
});
