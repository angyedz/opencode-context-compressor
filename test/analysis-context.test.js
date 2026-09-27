'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const a=require('../src/context/analysis-context');

test('analysis context reuses graph index and dependency maps for the same turn array',()=>{
  const turns=[[{role:'user',content:'src/a.js calls src/b.js'}]];
  const graph1=a.graph(turns);
  const graph2=a.graph(turns);
  const index1=a.index(turns);
  const index2=a.index(turns);
  const deps1=a.dependencies(turns,'src/a.js',2);
  const deps2=a.dependencies(turns,'src/a.js',2);
  assert.equal(graph1,graph2);
  assert.equal(index1,index2);
  assert.equal(deps1,deps2);
  assert.equal(a.stats(turns).dependencyQueries,1);
});

test('analysis cache can be invalidated explicitly',()=>{
  const turns=[[{role:'user',content:'src/a.js'}]];
  const before=a.graph(turns);
  a.invalidate(turns);
  const after=a.graph(turns);
  assert.notEqual(before,after);
});
