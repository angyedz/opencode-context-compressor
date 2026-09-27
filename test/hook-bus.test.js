'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EVENTS,HookBus}=require('../src/context/hook-bus');

test('compaction lifecycle hooks can save metadata before destructive compaction',async()=>{
 const bus=new HookBus();
 let seen=null;bus.on(EVENTS.BEFORE,p=>{seen=p;return {saved:true};});
 const r=await bus.emit(EVENTS.BEFORE,{session:'s',epoch:2});
 assert.equal(r[0].ok,true);assert.equal(seen.epoch,2);
});

test('bad hook cannot block compaction forever',async()=>{
 const bus=new HookBus({timeoutMs:20});
 bus.on(EVENTS.BEFORE,()=>new Promise(()=>{}));
 const r=await bus.emit(EVENTS.BEFORE,{});
 assert.equal(r[0].ok,false);assert.equal(r[0].error.code,'ERR_HOOK_TIMEOUT');
});
