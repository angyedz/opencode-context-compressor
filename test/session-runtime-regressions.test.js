'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {GenerationCache}=require('../src/context/generation-cache');
const child=require('../src/context/child-session-inheritance');
const {SubagentRegistry}=require('../src/context/subagent-registry');
const {SessionLeaseTable,chooseContinuation}=require('../src/context/session-lease');
const prompt=require('../src/context/cache-stable-system-prompt');
const {ToolRegistryGeneration}=require('../src/context/tool-registry-generation');
const {DoomLoopDetector}=require('../src/context/doom-loop-detector');
const {SummaryDebouncer}=require('../src/context/summary-debouncer');

test('session cache invalidates atomically on compaction generation change',()=>{
 const c=new GenerationCache();c.set('s','messages',['a']);c.set('s','tools',{read:true},'agent:model:g0');
 c.invalidate('s','compaction');assert.equal(c.get('s','messages'),null);assert.equal(c.get('s','tools','agent:model:g0'),null);
});

test('child session inherits workspace and MCP permissions without replacing parent grants',()=>{
 const c=child.inherit({id:'p',directory:'/repo',workspaceID:'w',projectID:'pr',permissions:{mcp_read:'allow',external_directory:'allow'}},{permissions:{task:'deny'}});
 assert.equal(c.directory,'/repo');assert.equal(c.permissions.mcp_read,'allow');assert.equal(c.permissions.external_directory,'allow');assert.equal(c.permissions.task,'deny');
});

test('background subagent completion remains pending until parent acknowledges delivery',()=>{
 const r=new SubagentRegistry();r.register('p',{sessionId:'c',agent:'explore'});r.complete('p','c',{text:'done'});
 assert.equal(r.pendingCompletions('p').length,1);r.acknowledge('p','c');assert.equal(r.pendingCompletions('p').length,0);
});

test('continue refuses most-recent session when another live owner holds its lease',()=>{
 const l=new SessionLeaseTable({ttlMs:60000});l.acquire('new','owner-a',{workspace:'/repo'});
 const picked=chooseContinuation([{id:'new',directory:'/repo',time_updated:20},{id:'old',directory:'/repo',time_updated:10}],{workspace:'/repo',leases:l,owner:'owner-b'});
 assert.equal(picked.id,'old');
});

test('dynamic cwd and date move to ephemeral reminders after session start',()=>{
 const r=prompt.sessionPromptPlan([{kind:'policy',content:'stable rules'},{kind:'cwd',content:'/repo'},{kind:'date',content:'today'}],{sessionStarted:true});
 assert.equal(r.system.length,1);assert.equal(r.reminders.length,2);
});

test('MCP registry generation changes tool cache key only when server definition changes',()=>{
 const g=new ToolRegistryGeneration();const a=g.update('x',{fingerprint:'1',tools:[1]});const key=g.cacheKey('a','m');
 const b=g.update('x',{fingerprint:'1',tools:[1]});assert.equal(b.changed,false);assert.equal(g.cacheKey('a','m'),key);
 g.update('x',{fingerprint:'2',tools:[1,2]});assert.notEqual(g.cacheKey('a','m'),key);
});

test('in-memory doom loop trips after identical tool call and result repeats',()=>{
 const d=new DoomLoopDetector({repeatThreshold:3});let r;
 for(let i=0;i<3;i++)r=d.record('s',{tool:'read',argsHash:'a',resultHash:'same'});
 assert.equal(r.stuck,true);assert.equal(r.action,'interrupt-and-summarize');
});

test('summary recomputation is debounced until meaningful session progress',()=>{
 const d=new SummaryDebouncer({minSteps:5,minNewChars:1000,maxAgeMs:999999});
 d.mark('s',{step:1,newChars:100});
 assert.equal(d.shouldRun('s',{step:2,newChars:200}).run,false);
 assert.equal(d.shouldRun('s',{step:6,newChars:200}).run,true);
});
