'use strict';

const tokenBudget = require('./token-budget');
const semanticGraph = require('./semantic-graph');
const stateEngine = require('./state-engine');

function safeText(content){
  if(typeof content==='string') return content;
  if(Array.isArray(content)) return content.map(p=>typeof p==='string'?p:(p?.text||'')).join('\n');
  return content?.text||'';
}

function splitTurns(messages){
  const turns=[]; let current=[];
  for(const message of messages||[]){
    const isToolResultUser=message?.role==='user'&&Array.isArray(message.content)&&message.content.some(p=>p?.type==='tool_result'||p?.functionResponse);
    const starts=message?.role==='user'&&!isToolResultUser;
    if(starts&&current.length){turns.push(current);current=[message];}else current.push(message);
  }
  if(current.length) turns.push(current);
  return turns;
}

function recentUser(messages){
  for(let i=(messages||[]).length-1;i>=0;i--) if(messages[i]?.role==='user') return safeText(messages[i].content);
  return '';
}

function inspect(messages,{maxDepth=2}={}){
  const turns=splitTurns((messages||[]).filter(m=>m?.role!=='system'));
  const active=recentUser(messages);
  const graph=semanticGraph.buildDependencyGraph(turns);
  const relevance=semanticGraph.explainRelevance(turns,active,maxDepth);
  const stats=semanticGraph.graphStats(graph);
  const tokens=tokenBudget.estimateMessagesTokens(messages);
  const chars=(()=>{try{return JSON.stringify(messages).length;}catch(_){return 0;}})();
  const facts=[];
  for(const turn of turns.slice(-12)){
    for(const message of turn){
      const text=safeText(message.content);
      if(/\b(error|failed|todo|fixme|decision|must|contract|resolved|fixed|passed)\b/i.test(text)) facts.push(text.replace(/\s+/g,' ').slice(0,240));
    }
  }
  return {
    messages:(messages||[]).length,
    turns:turns.length,
    chars,
    estimatedTokens:tokens,
    graph:stats,
    activeEntities:semanticGraph.factEntities(active),
    relevantEntities:relevance.slice(0,20),
    state:stateEngine.stateMetrics(facts),
  };
}

function render(report){
  return [
    '🧭 **Context Diagnostics**',
    '',
    `- Messages / turns: **${report.messages} / ${report.turns}**`,
    `- Serialized size: **${report.chars.toLocaleString()} chars**`,
    `- Estimated tokens: **~${report.estimatedTokens.toLocaleString()}**`,
    `- Dependency graph: **${report.graph.nodes} nodes / ${report.graph.edges} edges**`,
    `- Active entities: ${report.activeEntities.length?report.activeEntities.join(', '):'none detected'}`,
    `- Relevant graph nodes: ${report.relevantEntities.length?report.relevantEntities.map(x=>`${x.entity}(d${x.depth})`).join(', '):'none'}`,
    `- State facts: blockers=${report.state.blockers||0}, constraints=${report.state.constraints||0}, pending=${report.state.pending||0}, failed_attempts=${report.state.failed_attempts||0}`,
  ].join('\n');
}

module.exports={splitTurns,recentUser,inspect,render};
