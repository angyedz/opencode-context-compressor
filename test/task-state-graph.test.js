'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const t=require('../src/context/task-state-graph');

test('task graph links records sharing implementation entities',()=>{
  const graph=t.buildTaskStateGraph([
    {fact:'Decision: src/auth/session.js API contract must remain stable',score:20,recency:3,entities:['src/auth/session.js']},
    {fact:'Error: src/auth/session.js validateSession(token) failed',score:25,recency:2,entities:['src/auth/session.js','validatesession(token)']},
    {fact:'TODO fix validateSession(token)',score:18,recency:1,entities:['validatesession(token)']},
  ]);
  assert.equal(graph.nodes.length,3);
  assert.ok(graph.edges.length>=2);
  const selected=t.selectTaskSubgraph(graph,['src/auth/session.js'],{maxNodes:5,maxDepth:2});
  assert.ok(selected.some(n=>/TODO/.test(n.fact)));
});

test('task graph stats preserve state categories',()=>{
  const graph=t.buildTaskStateGraph([
    {fact:'Error: src/a.js failed',entities:['src/a.js']},
    {fact:'Decision: src/a.js contract must remain compatible',entities:['src/a.js']},
  ]);
  const stats=t.graphStats(graph);
  assert.equal(stats.nodes,2);
  assert.ok(stats.byKind.blockers>=1);
  assert.ok(stats.byKind.constraints>=1);
});
