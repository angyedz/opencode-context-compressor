'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {compressMessages}=require('../src/compressor');

test('tiny historical budget keeps current turn and critical state anchors',()=>{
  const messages=[
    {role:'user',content:'Implement src/auth/session.js.'},
    {role:'assistant',content:'Decision: src/auth/session.js API contract must remain compatible. Error: validateSession(token) accepts expired tokens. TODO add regression test.'},
  ];
  for(let i=0;i<22;i++){
    messages.push({role:'user',content:'noise '+i+' '+ 'x'.repeat(500)});
    messages.push({role:'assistant',content:'noise result '+i+' '+ 'y'.repeat(500)});
  }
  const current='Fix validateSession(token) in src/auth/session.js without breaking the API contract.';
  messages.push({role:'user',content:current});
  const out=compressMessages(messages,{maxChars:2200});
  const text=JSON.stringify(out);
  assert.equal(out[out.length-1].content,current);
  assert.match(text,/src\/auth\/session\.js/);
  assert.match(text,/API contract|validateSession/);
});
