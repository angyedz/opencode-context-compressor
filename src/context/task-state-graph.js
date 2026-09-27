'use strict';

const { classifyFact, lifecycleState } = require('./state-engine');

function normalizeEntities(record){
  return [...new Set((record?.entities||[]).map(x=>String(x).toLowerCase()).filter(Boolean))];
}

function nodeId(record,index){
  const entity=normalizeEntities(record)[0]||record?.topic||'fact';
  return `${entity}#${record?.recency??index}#${index}`;
}

function sharedEntities(a,b){
  const set=new Set(normalizeEntities(a));
  return normalizeEntities(b).filter(x=>set.has(x));
}

function buildTaskStateGraph(records){
  const nodes=(records||[]).map((record,index)=>({
    id:nodeId(record,index),
    fact:record.fact,
    score:record.score||0,
    recency:record.recency??null,
    sourceRole:record.sourceRole||record.role||'unknown',
    entities:normalizeEntities(record),
    topic:record.topic||null,
    lifecycle:record.lifecycle||lifecycleState(record.fact),
    kind:classifyFact(record.fact),
    reasons:record.reasons||[],
  }));

  const edges=[];
  for(let i=0;i<nodes.length;i++){
    for(let j=i+1;j<nodes.length;j++){
      const a=nodes[i],b=nodes[j];
      const shared=sharedEntities(a,b);
      if(shared.length){
        edges.push({from:a.id,to:b.id,type:'shared-entity',entities:shared.slice(0,4)});
        continue;
      }
      if(a.topic&&b.topic&&a.topic===b.topic){
        edges.push({from:a.id,to:b.id,type:'same-topic',entities:[]});
      }
    }
  }

  return {nodes,edges};
}

function adjacency(graph){
  const map=new Map();
  for(const node of graph?.nodes||[]) map.set(node.id,[]);
  for(const edge of graph?.edges||[]){
    map.get(edge.from)?.push({id:edge.to,edge});
    map.get(edge.to)?.push({id:edge.from,edge});
  }
  return map;
}

function selectTaskSubgraph(graph,seedEntities,{maxNodes=12,maxDepth=2}={}){
  const seeds=new Set((seedEntities||[]).map(x=>String(x).toLowerCase()));
  const start=(graph?.nodes||[])
    .filter(n=>n.entities.some(e=>seeds.has(e)))
    .sort((a,b)=>b.score-a.score)
    .map(n=>n.id);

  const byId=new Map((graph?.nodes||[]).map(n=>[n.id,n]));
  const adj=adjacency(graph);
  const queue=start.map(id=>({id,depth:0}));
  const seen=new Set();
  const selected=[];

  while(queue.length&&selected.length<maxNodes){
    const {id,depth}=queue.shift();
    if(seen.has(id)) continue;
    seen.add(id);
    const node=byId.get(id);
    if(!node) continue;
    selected.push({...node,depth});
    if(depth>=maxDepth) continue;
    const next=(adj.get(id)||[])
      .map(x=>byId.get(x.id))
      .filter(Boolean)
      .sort((a,b)=>b.score-a.score);
    for(const node of next) if(!seen.has(node.id)) queue.push({id:node.id,depth:depth+1});
  }
  return selected;
}

function graphStats(graph){
  const nodes=graph?.nodes||[];
  const byKind={};
  const byLifecycle={};
  for(const node of nodes){
    byKind[node.kind]=(byKind[node.kind]||0)+1;
    byLifecycle[node.lifecycle]=(byLifecycle[node.lifecycle]||0)+1;
  }
  return {nodes:nodes.length,edges:(graph?.edges||[]).length,byKind,byLifecycle};
}

module.exports={normalizeEntities,nodeId,sharedEntities,buildTaskStateGraph,adjacency,selectTaskSubgraph,graphStats};
