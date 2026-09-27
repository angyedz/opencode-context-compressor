'use strict';

const { factEntities } = require('./semantic-graph');

function lexicalTokens(text){
  return new Set((String(text||'').toLowerCase().match(/[a-z0-9_./:-]{4,}/g)||[]).slice(0,512));
}

function add(reasons,name,points,detail=null){
  if(!points) return 0;
  reasons.push({name,points,...(detail?{detail}:{})});
  return points;
}

function scoreFactDetailed(fact,activeText='',{
  dependencyDistances=null,
  recency=0,
  recencyWindow=12,
}={}){
  const text=String(fact||'').replace(/\s+/g,' ').trim();
  const lower=text.toLowerCase();
  const reasons=[];
  let score=1;

  if(/\b(error|failed|exception|panic|regression|broken|failure)\b/.test(lower)) score+=add(reasons,'failure',7);
  if(/\b(decision|decided|must|require|required|contract|compatib|invariant)\b/.test(lower)) score+=add(reasons,'constraint',6);
  if(/\b(todo|fixme|next|remaining|blocked|pending)\b/.test(lower)) score+=add(reasons,'pending-work',5);
  if(/(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.[A-Za-z0-9]+/.test(text)) score+=add(reasons,'file-path',5);
  if(/[A-Za-z_$][A-Za-z0-9_$]*\([^)]{0,120}\)/.test(text)) score+=add(reasons,'call-signature',4);
  if(/\b(test|api|endpoint|schema|signature|branch|commit)\b/.test(lower)) score+=add(reasons,'engineering-anchor',3);

  const activeTokens=lexicalTokens(activeText);
  let lexicalHits=0;
  for(const token of lexicalTokens(text)) if(activeTokens.has(token)) lexicalHits++;
  if(lexicalHits) score+=add(reasons,'lexical-overlap',Math.min(9,lexicalHits*3),String(lexicalHits));

  const activeEntities=new Set(factEntities(activeText));
  let exactEntities=0;
  let bestDepth=Infinity;
  for(const entity of factEntities(text)){
    if(activeEntities.has(entity)) exactEntities++;
    if(dependencyDistances?.has(entity)) bestDepth=Math.min(bestDepth,dependencyDistances.get(entity));
  }
  if(exactEntities) score+=add(reasons,'exact-entity',Math.min(16,exactEntities*8),String(exactEntities));
  if(bestDepth===1) score+=add(reasons,'dependency-hop-1',6);
  else if(bestDepth===2) score+=add(reasons,'dependency-hop-2',3);

  if(recency>0&&recency<=recencyWindow){
    const bonus=Math.max(0,4-Math.floor(recency/3));
    score+=add(reasons,'recency',bonus,String(recency));
  }

  return {score,reasons,text,exactEntities,dependencyDepth:Number.isFinite(bestDepth)?bestDepth:null,lexicalHits};
}

function compareScored(a,b){
  return (b.score-a.score)||(a.recency||0)-(b.recency||0)||String(a.fact||'').localeCompare(String(b.fact||''));
}

function summarizeReasons(scored){
  return (scored?.reasons||[]).map(r=>`${r.name}+${r.points}${r.detail?`(${r.detail})`:''}`).join(', ');
}

module.exports={lexicalTokens,scoreFactDetailed,compareScored,summarizeReasons};
