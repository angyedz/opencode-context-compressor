'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const e=require('../src/context/error-log-compactor');
const {compressTerminalOutput}=require('../src/compressor');

function makeLog(){
  const lines=[];
  for(let i=0;i<120;i++) lines.push('progress step '+i);
  lines.splice(55,0,'Caused by: Error: refresh token expired unexpectedly');
  lines.splice(56,0,'    at validateSession (src/auth/session.js:88:13)');
  lines.splice(57,0,'    at authMiddleware (src/auth/middleware.js:42:7)');
  lines.splice(80,0,'Expected: 200');
  lines.splice(81,0,'Received: 401');
  lines.push('FAIL test:auth-refresh');
  return lines.join('\n');
}

test('error compactor retains middle cause project frames and assertion',()=>{
  const out=e.compactErrorLog(makeLog(),{targetChars:1800,maxLines:30});
  assert.match(out,/refresh token expired/);
  assert.match(out,/src\/auth\/session\.js:88/);
  assert.match(out,/Expected: 200/);
  assert.match(out,/Received: 401/);
  assert.match(out,/FAIL test:auth-refresh/);
});

test('error line scoring prioritizes cause and errors over progress',()=>{
  assert.ok(e.lineScore('Caused by: Error: bad')>e.lineScore('progress 55%'));
  assert.ok(e.lineScore('at fn (src/a.js:10:2)')>0);
});

test('terminal compression uses semantic error selection',()=>{
  const log=makeLog()+'\n'+ 'noise\n'.repeat(300);
  const out=compressTerminalOutput(log,1600);
  assert.match(out,/refresh token expired/);
  assert.match(out,/FAIL test:auth-refresh/);
  assert.ok(out.length<log.length);
});
