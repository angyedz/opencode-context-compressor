'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const commands=require('../src/commands');

test('compressor explain includes ranked anchor reasoning for prior task context',()=>{
  const messages=[
    {role:'user',content:'Implement src/auth/session.js.'},
    {role:'assistant',content:'Error: src/auth/session.js validateSession(token) failed regression test. Decision: API contract must remain compatible.'},
    {role:'user',content:'Fix validateSession(token) in src/auth/session.js'},
    {role:'assistant',content:'working'},
    {role:'user',content:'$compressor explain'},
  ];
  const text=commands.executeCommand(messages,'explain-command-test');
  assert.match(text,/Top context anchors/);
  assert.match(text,/score=/);
  assert.match(text,/src\/auth\/session\.js/);
});
