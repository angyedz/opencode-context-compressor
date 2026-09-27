'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const e=require('../src/context/selection-explain');

test('selection explanation renders rank score source and reasons',()=>{
  const records=[{
    fact:'Error: src/auth/session.js validateSession(token) failed.',
    score:31,
    sourceRole:'assistant',
    lifecycle:'open',
    entities:['src/auth/session.js'],
    reasons:[{name:'failure',points:7},{name:'exact-entity',points:8}],
  }];
  const text=e.renderSelection(records);
  assert.match(text,/score=31/);
  assert.match(text,/source=assistant/);
  assert.match(text,/failure\+7/);
  assert.match(text,/exact-entity\+8/);
});

test('public selection can omit fact bodies',()=>{
  const out=e.publicSelection([{fact:'SECRET',score:1,reasons:[]}],{includeFacts:false});
  assert.equal('fact' in out[0],false);
});
