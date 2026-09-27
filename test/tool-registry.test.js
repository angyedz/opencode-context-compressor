'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const registry=require('../src/context/tool-registry');

test('large MCP registry gets stable compact fingerprint without embedding schemas',()=>{
 const tools=Array.from({length:412},(_,i)=>({type:'function',function:{name:'tool_'+i,description:'Tool '+i,parameters:{type:'object',properties:{query:{type:'string'},page:{type:'integer'}}}}}));
 const r=registry.buildRegistry(tools);
 assert.equal(r.count,412);
 assert.equal(r.fingerprint.length,20);
 assert.ok(JSON.stringify(r).length<JSON.stringify(tools).length);
});

test('active tool selection keeps tools already used by the session first',()=>{
 const tools=['read_file','shell','database','outline'].map(name=>({type:'function',function:{name,parameters:{type:'object'}}}));
 const messages=[{role:'assistant',tool_calls:[{id:'1',type:'function',function:{name:'outline',arguments:'{}'}}]}];
 const r=registry.selectActiveTools(tools,messages,{maxTools:2});
 assert.equal(registry.toolName(r.selected[0]),'outline');
 assert.match(registry.continuitySignal(r.registry),/4 tools remain registered/);
});
