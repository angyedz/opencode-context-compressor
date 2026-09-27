'use strict';

function clamp(value,min,max){return Math.max(min,Math.min(max,value));}

function planContext({
  maxChars=16000,
  recentDensity=0,
  recentAverageSize=0,
  dependencyCandidates=0,
  hasWorkingState=true,
  structuredDensity=0,
}={}){
  const pressure=clamp((recentAverageSize/7000)+(recentDensity*0.8)+(structuredDensity*0.6),0,2.5);
  let recent=pressure>1.35?0.36:pressure>0.75?0.46:0.58;
  let rescue=dependencyCandidates>0?0.16:0.08;
  let state=hasWorkingState?0.18:0.08;
  let summary=1-recent-rescue-state;

  if(summary<0.12){
    const deficit=0.12-summary;
    recent=Math.max(0.30,recent-deficit);
    summary=1-recent-rescue-state;
  }

  const ratios={recent,rescue,state,summary};
  const budgets={};
  let used=0;
  const keys=['recent','rescue','state'];
  for(const key of keys){
    budgets[key]=Math.floor(maxChars*ratios[key]);
    used+=budgets[key];
  }
  budgets.summary=Math.max(0,maxChars-used);
  return {maxChars,ratios,budgets,pressure};
}

function utilizationReport(plan,actual={}){
  const report={};
  for(const key of ['recent','rescue','state','summary']){
    const budget=plan?.budgets?.[key]||0;
    const used=Number(actual[key]||0);
    report[key]={budget,used,utilization:budget?used/budget:0,overflow:Math.max(0,used-budget)};
  }
  return report;
}

function rebalance(plan,actual={}){
  const next=JSON.parse(JSON.stringify(plan));
  const report=utilizationReport(plan,actual);
  let spare=0;
  for(const key of Object.keys(report)){
    if(report[key].used<report[key].budget) spare+=report[key].budget-report[key].used;
  }
  const rescueNeed=Math.max(0,(actual.rescue||0)-(plan.budgets.rescue||0));
  const stateNeed=Math.max(0,(actual.state||0)-(plan.budgets.state||0));
  const summaryNeed=Math.max(0,(actual.summary||0)-(plan.budgets.summary||0));
  for(const [key,need] of [['rescue',rescueNeed],['state',stateNeed],['summary',summaryNeed]]){
    const grant=Math.min(spare,need);
    next.budgets[key]+=grant; spare-=grant;
  }
  return next;
}

module.exports={clamp,planContext,utilizationReport,rebalance};
