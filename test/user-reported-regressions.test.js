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

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {CompactionTransaction}=require('../src/context/compaction-transaction');
const {validateSummary}=require('../src/context/summary-validator');
const boundary=require('../src/context/semantic-boundary');
const instructions=require('../src/context/instruction-registry');
const {CheckpointStore}=require('../src/context/checkpoint-store');

test('regression: reasoning-only empty summary is rejected before destructive commit',()=>{
 const summary={role:'assistant',content:[{type:'reasoning',text:'internal thought only'}]};
 const v=validateSummary(summary,{sourceChars:50000});
 assert.equal(v.valid,false);
 assert.equal(v.checks.notReasoningOnly,false);
});

test('transaction rollback restores exact pre-compaction transcript after bad summary',()=>{
 const store=new CompactionTransaction();
 const original=[{role:'user',content:'critical task'},{role:'tool',tool_call_id:'x',content:'critical result'}];
 const tx=store.begin('s',original);
 store.stage('s',tx.id,[{role:'user',content:''}],{valid:false});
 const restored=store.rollback('s',tx.id,'empty-summary');
 assert.deepEqual(restored,original);
});

test('tool-heavy session boundary does not jump all the way back to initial user message',()=>{
 const messages=[{role:'user',content:'start'}];
 for(let i=0;i<30;i++){
  messages.push({role:'assistant',tool_calls:[{id:'q'+i,type:'function',function:{name:'question',arguments:'{}'}}],content:''});
  messages.push({role:'tool',tool_call_id:'q'+i,content:'answer '+i});
 }
 const index=boundary.findReplayBoundary(messages,{targetIndex:messages.length-2});
 assert.ok(index>40,'boundary should remain near recent tool interactions');
});

test('AGENTS.md and CLAUDE.md behavioral rules survive into compact registry',()=>{
 const r=instructions.build([
  {path:'AGENTS.md',content:'- Never force push\n- Always run tests before commit\nnotes'},
  {path:'docs/CLAUDE.md',content:'You must preserve API compatibility.'},
 ]);
 assert.equal(r.count,2);
 const text=instructions.render(r);
 assert.match(text,/Never force push/);
 assert.match(text,/preserve API compatibility/);
});

test('fork starts from latest compacted checkpoint rather than pre-compaction history',()=>{
 const c=new CheckpointStore();
 c.save('parent',{epoch:4,messages:[{role:'user',content:'<compacted_history>small</compacted_history>'}],summary:'small'});
 c.fork('parent','child');
 const child=c.latest('child');
 assert.equal(child.epoch,4);
 assert.equal(child.messages.length,1);
 assert.match(child.messages[0].content,/compacted_history/);
});
