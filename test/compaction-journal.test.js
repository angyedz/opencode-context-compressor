'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {CompactionJournal}=require('../src/context/compaction-journal');

test('pre-compaction journal restores exact transcript after failed destructive operation',async()=>{
 const j=new CompactionJournal();
 const messages=[{role:'user',content:'critical'},{role:'assistant',content:'state'}];
 const e=await j.append('s',{epoch:3,messages,reason:'overflow'});
 const restored=await j.restore('s',e.id);
 assert.deepEqual(restored.payload.messages,messages);
 assert.equal(restored.entry.epoch,3);
});

test('journal supports external payload adapter so full history need not live in runtime memory',async()=>{
 const backing=new Map();
 const adapter={
  async save(session,id,payload){const ref=session+':'+id;backing.set(ref,JSON.parse(JSON.stringify(payload)));return ref;},
  async load(ref){return backing.get(ref);}
 };
 const j=new CompactionJournal({payloadAdapter:adapter});
 const e=await j.append('s',{messages:[{role:'user',content:'x'}]});
 assert.ok(e.payloadRef);
 const r=await j.restore('s');
 assert.equal(r.payload.messages[0].content,'x');
});
