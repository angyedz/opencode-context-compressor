'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const c=require('../src/context/tool-compactor');

test('line compactor collapses repeated progress spam inside one output',()=>{
  const text=Array.from({length:20},()=> 'progress 50%').join('\n')+'\nPASS';
  const out=c.summarizeRepeated(text);
  assert.match(out,/same line repeated 19 more times/);
  assert.match(out,/PASS/);
  assert.ok(out.length<text.length);
});

test('fingerprint ignores volatile time pid duration and temp id noise',()=>{
  const a='12:30:01 pid=123 finished in 1.2s /tmp/build-abcd';
  const b='12:30:59 pid=999 finished in 8.8s /tmp/build-efgh';
  assert.equal(c.stableFingerprint(a),c.stableFingerprint(b));
});

test('state change detector distinguishes stable success and failure',()=>{
  assert.equal(c.detectStateChange('PASS','PASS').changed,false);
  assert.equal(c.detectStateChange('FAIL','PASS').kind,'success');
  assert.equal(c.detectStateChange('PASS','Error: broken').kind,'failure');
});
