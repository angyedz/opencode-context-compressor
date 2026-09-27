'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const p=require('../src/context/summary-packer');

test('state lines are atomized by fact before packing',()=>{
  const lines=p.expandStateLines('### Working state\n- blockers: Error A ; Error B\n- constraints: Contract C');
  assert.deepEqual(lines,['- blockers: Error A','- blockers: Error B','- constraints: Contract C']);
});

test('tiny pack prioritizes blockers and constraints before excerpts',()=>{
  const packed=p.packSummary({
    stateText:'### Working state\n- implementation: impl detail\n- pending: TODO later\n- blockers: Error critical\n- constraints: API contract stable',
    anchors:['src/a.js','src/b.js'],
    excerpts:['old noise '.repeat(30),'recent useful excerpt'],
  },220);
  assert.match(packed,/Error critical/);
  assert.match(packed,/API contract stable/);
  assert.ok(packed.length<=220);
});

test('packing is deterministic',()=>{
  const args=[{stateText:'### Working state\n- blockers: Error X',anchors:['a','b'],excerpts:['x','y']},180];
  assert.equal(p.packSummary(...args),p.packSummary(...args));
});
