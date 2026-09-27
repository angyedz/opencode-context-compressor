'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const report=require('../src/context/compression-report');

test('compression report contains no message bodies and measures savings',()=>{
  const input=[{role:'user',content:'SECRET_INPUT '+ 'x'.repeat(2000)},{role:'assistant',content:'SECRET_REPLY '+ 'y'.repeat(2000)},{role:'user',content:'current'}];
  const output=[{role:'system',content:'directive'},{role:'user',content:'current'}];
  const r=report.buildCompressionReport(input,output,{maxChars:4000});
  assert.ok(r.before.chars>r.after.chars);
  assert.ok(r.savings.tokens>=0);
  const serialized=JSON.stringify(report.publicReport(r));
  assert.doesNotMatch(serialized,/SECRET_INPUT|SECRET_REPLY/);
});

test('compression report keeps protocol quality signal',()=>{
  const input=[{role:'user',content:'x'}];
  const output=[{role:'tool',tool_call_id:'missing',content:'oops'},{role:'user',content:'x'}];
  const r=report.buildCompressionReport(input,output,{});
  assert.equal(r.quality.protocolValid,false);
});
