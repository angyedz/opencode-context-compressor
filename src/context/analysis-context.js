'use strict';

const semanticGraph=require('./semantic-graph');
const semanticIndex=require('./semantic-index');

const cache=new WeakMap();

function ensure(turns){
  if(!Array.isArray(turns)) return {graph:new Map(),index:[],dependencies:new Map()};
  let entry=cache.get(turns);
  if(entry) return entry;
  const graph=semanticGraph.buildDependencyGraph(turns);
  const index=semanticIndex.buildSemanticIndex(turns);
  entry={graph,index,dependencies:new Map(),createdAt:Date.now()};
  cache.set(turns,entry);
  return entry;
}

function dependencyKey(activeText,maxDepth){return String(maxDepth)+'|'+String(activeText||'');}

function dependencies(turns,activeText,maxDepth=2){
  const entry=ensure(turns);
  const key=dependencyKey(activeText,maxDepth);
  if(!entry.dependencies.has(key)){
    entry.dependencies.set(key,semanticGraph.dependencyDistances(entry.graph,activeText,maxDepth));
  }
  return entry.dependencies.get(key);
}

function graph(turns){return ensure(turns).graph;}
function index(turns){return ensure(turns).index;}

function stats(turns){
  const entry=ensure(turns);
  return {
    graph:semanticGraph.graphStats(entry.graph),
    index:semanticIndex.indexStats(entry.index),
    dependencyQueries:entry.dependencies.size,
  };
}

function invalidate(turns){if(Array.isArray(turns)) cache.delete(turns);}

module.exports={ensure,dependencies,graph,index,stats,invalidate};
