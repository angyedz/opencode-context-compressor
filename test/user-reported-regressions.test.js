'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const repair=require('../src/context/tool-transcript-repair');
const {CompactionLoopGuard}=require('../src/context/compaction-loop-guard');
const awareness=require('../src/context/compaction-awareness');

test('regression: interrupted duplicate tool result keeps completed result and removes aborted duplicate',()=>{
 const input=[
  {role:'assistant',tool_calls:[{id:'call-1',type:'function',function:{name:'todowrite',arguments:'{}'}}],content:''},
  {role:'tool',tool_call_id:'call-1',content:'completed result'},
  {role:'tool',tool_call_id:'call-1',content:'Tool execution aborted'},
 ];
 const out=repair.repair(input);
 assert.equal(out.repaired,1);
 assert.equal(out.messages.filter(m=>m.role==='tool').length,1);
 assert.match(out.messages.find(m=>m.role==='tool').content,/completed/);
});

test('regression: ineffective compaction is stopped after bounded retries',()=>{
 const guard=new CompactionLoopGuard({maxConsecutive:3,minReduction:0.1});
 let r;
 for(let i=0;i<3;i++) r=guard.observe('s',{beforeTokens:10000,afterTokens:9700,messages:[{role:'user',content:'same huge context'}]});
 assert.equal(r.allow,false);
 assert.equal(r.reason,'repeated-ineffective-compaction');
 guard.observe('s',{productiveTurn:true});
 assert.equal(guard.get('s'),null);
});

test('regression: compaction epoch exposes an agent-visible continuity signal',()=>{
 awareness.clear('s');
 const state=awareness.record('s',{before:{tokens:10000},after:{tokens:3000},savings:{tokens:7000},quality:{score:96},provenance:{retained:4,removed:30,synthesized:1}});
 assert.equal(state.epoch,1);
 const signal=awareness.systemSignal('s');
 assert.equal(signal.role,'system');
 assert.match(signal.content,/Compaction epoch 1/);
 assert.match(signal.content,/7000 tokens/);
});
