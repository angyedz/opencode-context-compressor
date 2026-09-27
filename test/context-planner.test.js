'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const planner=require('../src/context/context-planner');

test('planner gives concise recent history more exact budget',()=>{
  const concise=planner.planContext({maxChars:16000,recentAverageSize:500,recentDensity:0.1,structuredDensity:0.1,dependencyCandidates:1});
  const noisy=planner.planContext({maxChars:16000,recentAverageSize:9000,recentDensity:0.8,structuredDensity:0.8,dependencyCandidates:1});
  assert.ok(concise.budgets.recent>noisy.budgets.recent);
  assert.ok(noisy.budgets.summary>=Math.floor(16000*0.12)-2);
});

test('planner always accounts for the complete budget',()=>{
  for(const maxChars of [2000,8000,16000,64000]){
    const plan=planner.planContext({maxChars,recentAverageSize:3000,recentDensity:0.4,dependencyCandidates:3,structuredDensity:0.5});
    assert.equal(Object.values(plan.budgets).reduce((a,b)=>a+b,0),maxChars);
  }
});

test('rebalance grants unused capacity to overflowing semantic sections',()=>{
  const plan=planner.planContext({maxChars:10000,dependencyCandidates:5});
  const next=planner.rebalance(plan,{recent:1000,rescue:5000,state:1000,summary:1000});
  assert.ok(next.budgets.rescue>=plan.budgets.rescue);
});
