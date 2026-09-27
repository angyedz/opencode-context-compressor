'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {FileReadCache}=require('../src/context/file-read-cache');
const ws=require('../src/context/file-working-set');
const compact=require('../src/context/file-read-compactor');

function read(id,path,content){
 return [
  {role:'assistant',content:'',tool_calls:[{id,type:'function',function:{name:'read_file',arguments:JSON.stringify({path})}}]},
  {role:'tool',tool_call_id:id,name:'read_file',content},
 ];
}

test('file cache invalidates stale entries when mtime/version changes',()=>{
 const c=new FileReadCache({maxEntries:2,maxBytes:1000});
 c.set('src\\a.js','abc',{mtimeMs:1});
 assert.equal(c.get('src/a.js',{mtimeMs:1}).digest.length,20);
 assert.equal(c.get('src/a.js',{mtimeMs:2}),null);
});

test('file cache is LRU bounded by entries',()=>{
 const c=new FileReadCache({maxEntries:2,maxBytes:1000});
 c.set('a','a');c.set('b','b');c.get('a');c.set('c','c');
 assert.ok(c.get('a'));assert.equal(c.get('b'),null);assert.ok(c.get('c'));
});

test('working set tracks latest read and invalidates it on observed write',()=>{
 const messages=[
  ...read('r1','src/a.js','const a=1;'),
  {role:'assistant',tool_calls:[{id:'w1',type:'function',function:{name:'write_file',arguments:'{"path":"src/a.js"}'}}],content:''},
  {role:'tool',tool_call_id:'w1',name:'write_file',content:'ok'},
 ];
 assert.equal(ws.buildWorkingSet(messages).byPath.has('src/a.js'),false);
});

test('real-user regression: 66 identical reads collapse to compact references',()=>{
 const messages=[];
 for(let i=0;i<66;i++) messages.push(...read('r'+i,'src/main.cpp','int main(){ return 0; }\n'.repeat(200)));
 const result=compact.compactRepeatedFileReads(messages);
 assert.equal(result.replaced,65);
 const serialized=JSON.stringify(result.messages);
 assert.ok(serialized.length<JSON.stringify(messages).length/10);
 assert.match(serialized,/Repeated file read omitted/);
});

test('a write between reads prevents unsafe duplicate compaction',()=>{
 const messages=[
  ...read('r1','src/a.js','old'),
  {role:'assistant',tool_calls:[{id:'w',type:'function',function:{name:'edit_file',arguments:'{"path":"src/a.js"}'}}],content:''},
  {role:'tool',tool_call_id:'w',name:'edit_file',content:'ok'},
  ...read('r2','src/a.js','old'),
 ];
 assert.equal(compact.compactRepeatedFileReads(messages).replaced,0);
});
