'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const d=require('../src/context/diagnostics');

test('diagnostics summarizes context without dumping full message bodies',()=>{
  const messages=[
    {role:'user',content:'Fix src/auth/session.js validateSession(token) SECRET_BODY_SHOULD_NOT_RENDER'},
    {role:'assistant',content:'Error: validateSession(token) failed.'},
    {role:'user',content:'continue src/auth/session.js'},
  ];
  const report=d.inspect(messages);
  assert.ok(report.graph.nodes>=1);
  assert.ok(report.index.uniqueEntities>=1);
  const rendered=d.render(report);
  assert.match(rendered,/Context Diagnostics/);
  assert.doesNotMatch(rendered,/SECRET_BODY_SHOULD_NOT_RENDER/);
});
