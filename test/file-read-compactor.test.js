'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const c=require('../src/context/file-read-compactor');

function readTurn(id,path,content){
  return [
    {role:'assistant',content:'',tool_calls:[{id,type:'function',function:{name:'read_file',arguments:JSON.stringify({path})}}]},
    {role:'tool',tool_call_id:id,name:'read_file',content},
  ];
}

test('repeated file reads keep newest full copy and compact older duplicates',()=>{
  const messages=[
    ...readTurn('r1','src/a.js','FULL CONTENT A'),
    {role:'user',content:'do something'},
    ...readTurn('r2','src/a.js','FULL CONTENT A'),
  ];
  const out=c.compactRepeatedFileReads(messages);
  assert.equal(out.replaced,1);
  assert.match(out.messages[1].content,/Older duplicate file read omitted/);
  assert.equal(out.messages[4].content,'FULL CONTENT A');
});

test('observed write creates a new file version and prevents cross-version dedupe',()=>{
  const messages=[
    ...readTurn('r1','src/a.js','SAME TEXT'),
    {role:'assistant',content:'',tool_calls:[{id:'w1',type:'function',function:{name:'write_file',arguments:'{"path":"src/a.js","content":"SAME TEXT"}'}}]},
    {role:'tool',tool_call_id:'w1',name:'write_file',content:'ok'},
    ...readTurn('r2','src/a.js','SAME TEXT'),
  ];
  const out=c.compactRepeatedFileReads(messages);
  assert.equal(out.replaced,0);
  const reads=c.collectFileReads(messages);
  assert.equal(reads.length,2);
  assert.notEqual(reads[0].version,reads[1].version);
});

test('different file contents are never deduplicated',()=>{
  const messages=[
    ...readTurn('r1','src/a.js','VERSION ONE'),
    ...readTurn('r2','src/a.js','VERSION TWO'),
  ];
  const out=c.compactRepeatedFileReads(messages);
  assert.equal(out.replaced,0);
});
