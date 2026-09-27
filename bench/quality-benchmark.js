'use strict';

const { compressMessages, messagesSize } = require('../src/compressor');
const corpus = require('./context-corpus');
const { evaluateCompression } = require('../src/context/quality-gates');
const { estimateMessagesTokens } = require('../src/context/token-budget');

const maxChars=Number(process.argv[2]||12000);
const results=[];

for(const sample of corpus.all()){
  const output=compressMessages(sample.messages,{maxChars});
  const report=evaluateCompression({input:sample.messages,output,anchors:sample.anchors,maxChars});
  const inputChars=messagesSize(sample.messages);
  const outputChars=messagesSize(output);
  results.push({
    workload:sample.name,
    score:report.score,
    anchorCoverage:Number(report.checks.anchorCoverage.toFixed(3)),
    protocolValid:report.checks.protocolValid,
    currentTurnExact:report.checks.currentTurnExact,
    inputChars,
    outputChars,
    charRatio:Number((inputChars/Math.max(1,outputChars)).toFixed(2)),
    inputTokens:estimateMessagesTokens(sample.messages),
    outputTokens:estimateMessagesTokens(output),
  });
}

console.log(JSON.stringify({maxChars,results},null,2));

let failed=false;
for(const result of results){
  if(result.score<85||!result.protocolValid||!result.currentTurnExact||result.anchorCoverage<0.5){
    console.error('quality regression:',result.workload,result);
    failed=true;
  }
}
if(failed) process.exitCode=1;
