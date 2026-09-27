'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {TokenPlateauDetector}=require('../src/context/token-plateau-detector');
const reserve=require('../src/context/adaptive-output-reserve');

test('detects hidden 196608-token provider ceiling even below configured overflow threshold',()=>{
 const d=new TokenPlateauDetector({window:6,tolerance:0.001,minUtilization:0.7});
 let r;for(let i=0;i<6;i++)r=d.observe('s',{inputTokens:196608+(i%2),configuredLimit:262144,cacheReadTokens:0});
 assert.equal(r.plateau,true);assert.equal(r.action,'compact');assert.equal(r.cacheCold,true);
});

test('high advertised output limit cannot consume most of compaction envelope',()=>{
 const r=reserve.compactionEnvelope({providerLimit:299964,inputTokens:236000,advertisedOutput:131072});
 assert.ok(r.outputReserve<=Math.floor(299964*0.25));
 assert.ok(r.total<=299964);
 assert.ok(r.maxInputTokens>0);
});
