'use strict';

const {factEntities,buildDependencyGraph,dependencyDistances}=require('./semantic-graph');
const {lifecycleState,classifyFact}=require('./state-engine');

function recencyScore(index,total){
  if(total<=1) return 1;
  return index/(total-1);
}

function urgencyScore(text){
  const bucket=classifyFact(text);
  const state=lifecycleState(text);
  if(state==='resolved') return -2;
  if(bucket==='blockers') return 6;
  if(bucket==='constraints') return 5;
  if(bucket==='pending') return 4;
  if(bucket==='failed_attempts') return 1;
  return 2;
}

function scoreRow(row,{activeEntities,distances,total}){
  let entityExact=0,graphNear=0;
  for(const entity of row.entities||[]){
    if(activeEntities.has(entity)) entityExact++;
    const d=distances.get(entity);
    if(d===1) graphNear+=2;
    else if(d===2) graphNear+=1;
  }
  const urgency=urgencyScore(row.text);
  const recency=recencyScore(row.index,total);
  const lexical=Number(row.lexicalOverlap||0);
  return {
    total:entityExact*12+graphNear*4+urgency+lexical*1.5+recency*3,
    signals:{entityExact,graphNear,urgency,lexical,recency},
  };
}

function diversify(scored,{limit=8,maxPerPrimaryEntity=3}={}){
  const counts=new Map(),out=[];
  for(const candidate of scored){
    if(out.length>=limit) break;
    const primary=(candidate.row.entities||[])[0]||candidate.row.fingerprint;
    const count=counts.get(primary)||0;
    if(count>=maxPerPrimaryEntity) continue;
    counts.set(primary,count+1);
    out.push(candidate);
  }
  return out;
}

function rank(index,activeText,{limit=8,maxPerPrimaryEntity=3}={}){
  const activeEntities=new Set(factEntities(activeText));
  const turns=(index||[]).map(x=>x.turn);
  const distances=dependencyDistances(buildDependencyGraph(turns),activeText,2);
  const queryWords=new Set((String(activeText||'').toLowerCase().match(/[a-z0-9_./:-]{4,}/g)||[]));
  const scored=(index||[]).map(row=>{
    let lexicalOverlap=0;
    for(const token of row.lexical||[]) if(queryWords.has(token)) lexicalOverlap++;
    const enriched={...row,lexicalOverlap};
    const score=scoreRow(enriched,{activeEntities,distances,total:index.length});
    return {row:enriched,score:score.total,signals:score.signals};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||b.row.index-a.row.index);
  return diversify(scored,{limit,maxPerPrimaryEntity});
}

function explain(candidate){
  return {
    turn:candidate.row.index,
    score:Number(candidate.score.toFixed(2)),
    entities:candidate.row.entities.slice(0,6),
    signals:candidate.signals,
  };
}

module.exports={recencyScore,urgencyScore,scoreRow,diversify,rank,explain};
