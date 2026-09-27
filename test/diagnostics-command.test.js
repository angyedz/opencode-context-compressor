'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const d=require('../src/context/diagnostics');

test('diagnostics ignores its own compressor command when finding active task',()=>{
  const messages=[
    {role:'user',content:'Fix src/auth/session.js'},
    {role:'assistant',content:'working'},
    {role:'user',content:'$compressor explain'},
  ];
  assert.equal(d.recentUser(messages),'Fix src/auth/session.js');
  const report=d.inspect(messages);
  assert.ok(report.activeEntities.includes('src/auth/session.js'));
});
