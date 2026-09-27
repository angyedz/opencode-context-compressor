'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const evidence=require('../src/context/summary-evidence');
const contradiction=require('../src/context/contradiction-resolver');
const {SearchResultCache}=require('../src/context/search-result-cache');

test('summary evidence accepts concrete entities grounded in source history',()=>{
 const source=[{role:'assistant',content:'Error in src/auth/session.js: ERR_SESSION_EXPIRED; test:auth-session failed'}];
 const r=evidence.verify('Continue fixing src/auth/session.js ERR_SESSION_EXPIRED and test:auth-session',source);
 assert.equal(r.valid,true);
});

test('summary evidence rejects hallucinated file and error identifiers',()=>{
 const source=[{role:'assistant',content:'Working in src/a.js'}];
 const r=evidence.verify('Also fix src/never-existed.js ERR_MAGIC_FAILURE',source);
 assert.equal(r.valid,false);
 assert.ok(r.unsupported.length>=1);
});

test('contradiction resolver keeps newest semantic state and records conflict',()=>{
 const r=contradiction.reconcile(['Feature X is enabled','Feature X is disabled']);
 assert.equal(r.facts.length,1);
 assert.match(r.facts[0],/disabled/);
 assert.equal(r.conflicts.length,1);
});

test('search cache invalidates same query when workspace revision changes',()=>{
 const c=new SearchResultCache({ttlMs:60000});
 c.set('grep','TODO',['a.js:1'],{scope:'repo',revision:'abc'});
 assert.ok(c.get('grep','TODO',{scope:'repo',revision:'abc'}));
 assert.equal(c.get('grep','TODO',{scope:'repo',revision:'def'}),null);
});
