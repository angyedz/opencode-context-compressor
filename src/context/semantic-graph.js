'use strict';

function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(extractText).filter(Boolean).join('\n');
  if (content && typeof content === 'object') {
    if (typeof content.text === 'string') return content.text;
    if (content.content !== undefined) return extractText(content.content);
  }
  return '';
}

function factEntities(text) {
  const source = String(text || '');
  const entities = new Set();
  for (const match of source.matchAll(/(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+(?:\.[A-Za-z0-9]+)?/g)) entities.add(match[0].toLowerCase());
  for (const match of source.matchAll(/\b[A-Za-z_$][A-Za-z0-9_$]*\([^)]{0,120}\)/g)) entities.add(match[0].replace(/\s+/g, '').toLowerCase());
  for (const match of source.matchAll(/\/[A-Za-z0-9_./:{}-]{2,}/g)) entities.add(match[0].toLowerCase());
  for (const match of source.matchAll(/\b(?:port|ttl|timeout|limit|budget|version)\s*(?:=|:|is|must be)?\s*\d+[A-Za-z]*\b/gi)) entities.add(match[0].toLowerCase());
  for (const match of source.matchAll(/\b(?:ERR_[A-Z0-9_]+|E[A-Z]{3,}[A-Z0-9_]*|[A-Za-z]+Error)\b/g)) entities.add(match[0].toLowerCase());
  for (const match of source.matchAll(/\b(?:test|spec)[:#._-][A-Za-z0-9_.:/-]+\b/gi)) entities.add(match[0].toLowerCase());
  return [...entities];
}

function buildDependencyGraph(turns) {
  const graph = new Map();
  const connect = (a,b) => {
    if (!a || !b || a === b) return;
    if (!graph.has(a)) graph.set(a,new Set());
    graph.get(a).add(b);
  };
  for (const turn of turns || []) {
    const entities = [...new Set((turn || []).flatMap(m => factEntities(extractText(m?.content))))].slice(0,16);
    for (let i=0;i<entities.length;i++) for (let j=i+1;j<entities.length;j++) {
      connect(entities[i],entities[j]); connect(entities[j],entities[i]);
    }
  }
  return graph;
}

function dependencyDistances(graph, activeText, maxDepth = 2) {
  const distance = new Map();
  const queue = [];
  for (const seed of factEntities(activeText)) { distance.set(seed,0); queue.push(seed); }
  while (queue.length) {
    const node = queue.shift();
    const depth = distance.get(node);
    if (depth >= maxDepth) continue;
    for (const next of graph.get(node) || []) {
      if (distance.has(next)) continue;
      distance.set(next,depth+1); queue.push(next);
    }
  }
  return distance;
}

function graphStats(graph) {
  let edges = 0;
  for (const neighbors of graph.values()) edges += neighbors.size;
  return { nodes: graph.size, edges: Math.floor(edges / 2), averageDegree: graph.size ? edges / graph.size : 0 };
}

function explainRelevance(turns, activeText, maxDepth = 2) {
  const graph = buildDependencyGraph(turns);
  const distances = dependencyDistances(graph, activeText, maxDepth);
  return [...distances.entries()]
    .sort((a,b)=>a[1]-b[1] || a[0].localeCompare(b[0]))
    .map(([entity,depth])=>({entity,depth}));
}

module.exports={extractText,factEntities,buildDependencyGraph,dependencyDistances,graphStats,explainRelevance};
