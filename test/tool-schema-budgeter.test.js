'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const b=require('../src/context/tool-schema-budgeter');

function tool(name,description,pad=''){return {type:'function',function:{name,description:description+pad,parameters:{type:'object',properties:{query:{type:'string',description:pad}}}}};}

test('412-tool registry is reduced to bounded relevant schema set',()=>{
 const tools=Array.from({length:412},(_,i)=>tool('generic_'+i,'unrelated utility ','x'.repeat(300)));
 tools.push(tool('read_file','read source code file from repository ','x'.repeat(300)));
 const r=b.select(tools,[],'read source file',{budgetTokens:2500,minTools:4,maxTools:20});
 assert.ok(r.tools.length<=20);
 assert.ok(r.omitted.length>350);
 assert.ok(r.tools.some(t=>t.function.name==='read_file'));
 assert.equal(r.registry.count,413);
});

test('already-active MCP tool survives schema budget even with weak lexical relevance',()=>{
 const tools=[tool('critical_mcp','zzz','x'.repeat(800)),...Array.from({length:20},(_,i)=>tool('other_'+i,'query helper','x'.repeat(200)))];
 const messages=[{role:'assistant',tool_calls:[{id:'1',type:'function',function:{name:'critical_mcp',arguments:'{}'}}]}];
 const r=b.select(tools,messages,'query',{budgetTokens:300,minTools:1,maxTools:3});
 assert.ok(r.tools.some(t=>t.function.name==='critical_mcp'));
});
