'use strict';

const tokenBudget=require('./token-budget');
const quality=require('./quality-gates');
const graph=require('./semantic-graph');
const envelopeBudget=require('./envelope-budget');
const provenance=require('./provenance-ledger');

function splitTurns(messages){
  const turns=[];let current=[];
  for(const message of (messages||[]).filter(m=>m?.role!=='system')){
    const toolResultUser=message?.role==='user'&&Array.isArray(message.content)&&message.content.some(p=>p?.type==='tool_result'||p?.functionResponse);
    const starts=message?.role==='user'&&!toolResultUser;
    if(starts&&current.length){turns.push(current);current=[message];}else current.push(message);
  }
  if(current.length) turns.push(current);
  return turns;
}

function serializedChars(value){try{return JSON.stringify(value).length;}catch(_){return 0;}}

function buildCompressionReport(input,output,{maxChars=null,maxTokens=null,maxInputTokens=null,reserveOutputTokens=4096,anchors=[]}={}){
  const beforeChars=serializedChars(input);
  const afterChars=serializedChars(output);
  const beforeTokens=tokenBudget.estimateMessagesTokens(input);
  const afterTokens=tokenBudget.estimateMessagesTokens(output);
  const q=quality.evaluateCompression({input,output,anchors,maxChars,maxTokens});
  const turns=splitTurns(output);
  const g=graph.graphStats(graph.buildDependencyGraph(turns));
  const inputTurns=splitTurns(input);
  const provenanceBefore=provenance.buildLedger(input);
  const provenanceAfter=provenance.buildLedger(output);
  const activeTurn=inputTurns.length?inputTurns[inputTurns.length-1]:[];
  const envelope=envelopeBudget.planInputEnvelope({
    maxInputTokens,
    reserveOutputTokens,
    systemMessages:(input||[]).filter(m=>m?.role==='system'),
    activeTurn,
    requestedHistoryTokens:maxTokens,
  });
  return {
    before:{chars:beforeChars,tokens:beforeTokens,messages:(input||[]).length},
    after:{chars:afterChars,tokens:afterTokens,messages:(output||[]).length},
    savings:{
      chars:Math.max(0,beforeChars-afterChars),
      tokens:Math.max(0,beforeTokens-afterTokens),
      charPercent:beforeChars?100*(1-afterChars/beforeChars):0,
      tokenPercent:beforeTokens?100*(1-afterTokens/beforeTokens):0,
      ratio:afterChars?beforeChars/afterChars:0,
    },
    quality:{score:q.score,...q.checks},
    graph:g,
    provenance:{...provenance.diffLedgers(provenanceBefore,provenanceAfter),currentUserExact:provenance.verifyCurrentUser(input,output)},
    limits:{maxChars,maxTokens,maxInputTokens,reserveOutputTokens},
    envelope,
    generatedAt:Date.now(),
  };
}

function publicReport(report){
  if(!report) return null;
  return {
    before:report.before,
    after:report.after,
    savings:report.savings,
    quality:report.quality,
    graph:report.graph,
    provenance:report.provenance,
    limits:report.limits,
    envelope:report.envelope,
    generatedAt:report.generatedAt,
  };
}

module.exports={serializedChars,splitTurns,buildCompressionReport,publicReport};
