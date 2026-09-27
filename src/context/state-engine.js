'use strict';

const OPEN_RE=/\b(error|failed|failure|broken|regression|blocked|todo|fixme|remaining|pending)\b/i;
const RESOLVED_RE=/\b(pass(?:ed)?|fixed|resolved|completed|done|green|succeeded|success|closed)\b/i;
const ATTEMPT_RE=/\b(tried|attempted|approach|workaround|experimented)\b/i;
const CONSTRAINT_RE=/\b(decision|decided|must|require|required|contract|compatib|invariant|signature|schema)\b/i;
const PENDING_RE=/\b(todo|fixme|next|remaining|pending)\b/i;

function lifecycleState(fact){
  const text=String(fact||'');
  if(RESOLVED_RE.test(text)) return 'resolved';
  if(OPEN_RE.test(text)) return 'open';
  return 'neutral';
}

function classifyFact(fact){
  const text=String(fact||'');
  if(ATTEMPT_RE.test(text)&&/\b(failed|did not work|didn't work|unsuccessful|broken)\b/i.test(text)) return 'failed_attempts';
  if(/\b(error|failed|exception|panic|regression|broken|failure|blocked)\b/i.test(text)) return 'blockers';
  if(CONSTRAINT_RE.test(text)) return 'constraints';
  if(PENDING_RE.test(text)) return 'pending';
  return 'implementation';
}

function bucketFacts(facts,{perBucket=6}={}){
  const buckets={blockers:[],failed_attempts:[],constraints:[],pending:[],implementation:[],resolved:[]};
  for(const fact of facts||[]){
    const state=lifecycleState(fact);
    if(state==='resolved'){
      if(buckets.resolved.length<perBucket) buckets.resolved.push(fact);
      continue;
    }
    const bucket=classifyFact(fact);
    if(buckets[bucket].length<perBucket) buckets[bucket].push(fact);
  }
  return buckets;
}

function renderWorkingState(facts,{includeResolved=false,perBucket=6}={}){
  const buckets=bucketFacts(facts,{perBucket});
  const lines=['### Working state'];
  for(const name of ['blockers','failed_attempts','constraints','pending','implementation']){
    if(buckets[name].length) lines.push(`- ${name}: ${buckets[name].join(' ; ')}`);
  }
  if(includeResolved&&buckets.resolved.length) lines.push(`- resolved: ${buckets.resolved.join(' ; ')}`);
  return lines.length>1?lines.join('\n'):'';
}

function stateMetrics(facts){
  const buckets=bucketFacts(facts,{perBucket:Number.MAX_SAFE_INTEGER});
  return Object.fromEntries(Object.entries(buckets).map(([k,v])=>[k,v.length]));
}

module.exports={lifecycleState,classifyFact,bucketFacts,renderWorkingState,stateMetrics};
