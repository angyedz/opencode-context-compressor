'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const chunks=require('../src/context/chunk-planner');
const manifest=require('../src/context/chunk-manifest');
const protocol=require('../src/context/protocol-boundary');
const memory=require('../src/context/memory-budget');

function rng(seed){let x=seed>>>0;return()=>((x=(x*1664525+1013904223)>>>0)/4294967296);}
function transcript(seed){
 const r=rng(seed),out=[];
 for(let i=0;i<80;i++){
  if(r()<0.22){
   const id='c'+seed+'_'+i;
   out.push({role:'assistant',content:'',tool_calls:[{id,type:'function',function:{name:'read_file',arguments:'{}'}}]});
   out.push({role:'tool',tool_call_id:id,content:'x'.repeat(20+Math.floor(r()*500))});
  }else out.push({role:r()<0.4?'user':'assistant',content:'m'+i+' '+ 'x'.repeat(20+Math.floor(r()*700))});
 }
 return out;
}

for(let seed=1;seed<=40;seed++)test('chunk fuzz seed '+seed,()=>{
 const messages=transcript(seed);
 const a=chunks.plan(messages,{maxChars:4000,overlap:1});
 const b=chunks.plan(messages,{maxChars:4000,overlap:1});
 assert.deepEqual(a,b);
 const m=manifest.manifest(a.chunks,messages.length);
 assert.equal(manifest.validate(m).valid,true);
 assert.equal(m.complete,true);
 const unsafe=protocol.unsafeBoundaries(messages);
 for(const c of a.chunks.slice(0,-1)){
  const desired=c.end+1;
  const safe=protocol.adjustBoundary(messages,desired);
  assert.equal(unsafe.has(safe),false);
 }
});

test('generic memory budget remains byte and item bounded',()=>{
 const items=Array.from({length:1000},(_,i)=>({i,data:'x'.repeat(1000)}));
 const r=memory.enforce(items,{maxItems:50,maxBytes:30000,scoreOf:x=>x.i});
 assert.ok(r.items.length<=50);assert.ok(r.bytes<=30000);assert.ok(r.dropped>900);
});
