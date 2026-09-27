'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const idx=require('../src/context/semantic-index');

test('semantic index captures entities, cost and tool density',()=>{
  const turns=[
    [{role:'user',content:'Fix src/auth/session.js validateSession(token)'},{role:'assistant',content:'working'}],
    [{role:'assistant',tool_calls:[{id:'c1',type:'function',function:{name:'shell',arguments:'{}'}}],content:'run'},{role:'tool',tool_call_id:'c1',content:'PASS'}],
  ];
  const index=idx.buildSemanticIndex(turns);
  assert.equal(index.length,2);
  assert.ok(index[0].entities.includes('src/auth/session.js'));
  assert.ok(index[0].chars>0&&index[0].tokens>0);
  assert.ok(index[1].toolHeavy>0);
});

test('semantic query ranks exact entity match above lexical-only noise',()=>{
  const turns=[
    [{role:'assistant',content:'src/ui/theme.js renderTheme(config) snapshot failure'}],
    [{role:'assistant',content:'src/auth/session.js validateSession(token) refresh failure'}],
    [{role:'assistant',content:'generic auth wording only'}],
  ];
  const result=idx.querySemanticIndex(idx.buildSemanticIndex(turns),'fix src/auth/session.js validateSession(token)',{limit:3});
  assert.equal(result[0].index,1);
  assert.ok(result[0].entityOverlap>=1);
});

test('semantic query obeys char and token admission budgets',()=>{
  const turns=Array.from({length:8},(_,i)=>[{role:'assistant',content:'src/a.js item '+i+' '+ 'x'.repeat(700)}]);
  const result=idx.querySemanticIndex(idx.buildSemanticIndex(turns),'src/a.js',{limit:8,maxChars:1800,maxTokens:600});
  const chars=result.reduce((s,x)=>s+x.chars,0);
  const tokens=result.reduce((s,x)=>s+x.tokens,0);
  assert.ok(chars<=1800);
  assert.ok(tokens<=600);
});
