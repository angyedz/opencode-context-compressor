'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {ToolSchemaCache}=require('../src/context/tool-schema-cache');
const catalog=require('../src/context/tool-namespace-catalog');

test('MCP schema cache survives runtime memory miss through persistent adapter',async()=>{
 const disk=new Map(),adapter={save:async(k,v)=>disk.set(k,v),load:async k=>disk.get(k),delete:async k=>disk.delete(k)};
 const a=new ToolSchemaCache({adapter,ttlMs:60000});await a.set('github',[{name:'issues.list'}],{version:'1'});
 const b=new ToolSchemaCache({adapter,ttlMs:60000});const hit=await b.get('github',{version:'1'});
 assert.equal(hit.tools[0].name,'issues.list');assert.equal(hit.fingerprint.length,20);
});

test('schema cache invalidates when MCP server version changes',async()=>{
 const c=new ToolSchemaCache({ttlMs:60000});await c.set('server',[{name:'a'}],{version:'1'});
 assert.equal(await c.get('server',{version:'2'}),null);
});

test('tool namespace catalog advertises capabilities without full schemas',()=>{
 const tools=['github.issues.list','github.pr.get','slack.search','slack.send','files.read'].map(name=>({function:{name}}));
 const groups=catalog.catalog(tools);const text=catalog.render(groups);
 assert.match(text,/github: 2 tools/);assert.match(text,/slack: 2 tools/);assert.ok(text.length<1000);
});
