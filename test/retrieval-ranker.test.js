'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const idx=require('../src/context/semantic-index');
const ranker=require('../src/context/retrieval-ranker');

test('retrieval ranker prioritizes exact active entity and unresolved constraints',()=>{
 const turns=[
  [{role:'assistant',content:'src/ui.js Error: unrelated render failure'}],
  [{role:'assistant',content:'Decision: src/auth/session.js validateSession(token) signature must remain compatible'}],
  [{role:'assistant',content:'src/auth/session.js old issue resolved and tests passed'}],
 ];
 const ranked=ranker.rank(idx.buildSemanticIndex(turns),'change src/auth/session.js validateSession(token)',{limit:3});
 assert.equal(ranked[0].row.index,1);
 assert.ok(ranked[0].signals.entityExact>=1);
});

test('retrieval diversity prevents one primary entity from monopolizing rescue slots',()=>{
 const turns=[];
 for(let i=0;i<8;i++) turns.push([{role:'assistant',content:'src/a.js TODO item '+i}]);
 turns.push([{role:'assistant',content:'src/b.js TODO related contract'}]);
 const ranked=ranker.rank(idx.buildSemanticIndex(turns),'src/a.js src/b.js contract',{limit:6,maxPerPrimaryEntity:2});
 const primaries=ranked.map(x=>x.row.entities[0]);
 assert.ok(primaries.filter(x=>x==='src/a.js').length<=2);
 assert.ok(primaries.includes('src/b.js'));
});
