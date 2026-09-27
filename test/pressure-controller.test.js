'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const p=require('../src/context/pressure-controller');

test('pressure includes MCP/tool schema overhead and output reserve',()=>{
 const r=p.pressure({inputTokens:6000,toolSchemaTokens:1500,providerLimit:10000,outputReserve:1500,safetyReserve:500});
 assert.equal(r.available,8000);
 assert.equal(r.used,7500);
 assert.equal(r.ratio,0.9375);
});

test('controller compacts before provider overflow instead of waiting for a 400',()=>{
 assert.equal(p.decision({inputTokens:7000,providerLimit:10000,outputReserve:1000,safetyReserve:500}).action,'compact');
 assert.equal(p.decision({inputTokens:8200,providerLimit:10000,outputReserve:1000,safetyReserve:500}).action,'emergency-compact');
});

test('hysteresis avoids repeated compaction immediately after successful compaction',()=>{
 const c=new p.PressureController({soft:0.7,hard:0.9});
 let r=c.evaluate('s',{inputTokens:6100,providerLimit:10000,outputReserve:1000,safetyReserve:500});
 assert.equal(r.action,'compact-soon');
 c.markCompacted('s',r.ratio);
 r=c.evaluate('s',{inputTokens:6200,providerLimit:10000,outputReserve:1000,safetyReserve:500});
 assert.equal(r.action,'observe');
 assert.equal(r.reason,'hysteresis');
});
