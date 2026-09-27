'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const d=require('../src/context/diff-compactor');
const {compressTerminalOutput}=require('../src/compressor');

function sampleDiff(){
  return [
    'diff --git a/src/a.js b/src/a.js',
    'index 1111111..2222222 100644',
    '--- a/src/a.js',
    '+++ b/src/a.js',
    '@@ -1,5 +1,8 @@',
    '-const oldValue = 1;',
    '+const newValue = 2;',
    '+function validateSession(token) {',
    '+  if (!token) throw new Error("missing token");',
    '+  return true;',
    '+}',
    ' context line',
    '@@ -100,5 +120,8 @@',
    '-function middleOld() {}',
    '+async function middleCritical() {',
    '+  await refreshToken();',
    '+  return validateSession(token);',
    '+}',
    ' context',
    '@@ -200,3 +230,4 @@',
    '-module.exports = oldValue;',
    '+module.exports = { newValue, middleCritical };',
  ].join('\n');
}

test('diff parser preserves files and every hunk header',()=>{
  const parsed=d.parseDiff(sampleDiff());
  assert.equal(parsed.length,1);
  assert.equal(parsed[0].hunks.length,3);
  assert.match(parsed[0].hunks[1].header,/@@ -100/);
});

test('diff compactor retains important middle hunk signatures',()=>{
  const compacted=d.compactDiff(sampleDiff(),{targetChars:1000,maxLinesPerHunk:5});
  assert.match(compacted,/middleCritical/);
  assert.match(compacted,/validateSession/);
  assert.match(compacted,/@@ -100/);
});

test('compressTerminalOutput delegates diff structure without exceeding wildly',()=>{
  const huge=sampleDiff()+'\n'+sampleDiff()+'\n'+sampleDiff();
  const compacted=compressTerminalOutput(huge,1200);
  assert.ok(compacted.length<huge.length);
  assert.match(compacted,/diff --git/);
});
