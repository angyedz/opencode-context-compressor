'use strict';

const compressor=require('../compressor');
const commands=require('../commands');
const compressionReport=require('./compression-report');
const runtimeMetrics=require('./runtime-metrics');
const tokenCalibration=require('./token-calibration');
const invariants=require('./invariants');
const transcriptRepair=require('./tool-transcript-repair');
const awareness=require('./compaction-awareness');

function requestOutputReserve(body){
  const candidates=[
    body?.max_completion_tokens,
    body?.max_tokens,
    body?.generationConfig?.maxOutputTokens,
    body?.generation_config?.max_output_tokens,
  ];
  for(const value of candidates){
    const n=Number(value);
    if(Number.isFinite(n)&&n>0) return n;
  }
  return null;
}

function resolveOptions(sessionKey,options={}){
  const reserveFromRequest=requestOutputReserve(options.requestBody);
  const provider=options.provider||'opencode';
  const model=options.model||options.requestBody?.model||'';
  const tokenScale=options.tokenScale??tokenCalibration.factor(provider,model);
  return {
    provider,
    model,
    tokenScale,
    ...options,
    disabled:commands.isCompressorDisabled(sessionKey)||options.compressorDisabled===true,
    maxChars:options.maxChars||commands.getSessionLimit(sessionKey),
    maxTokens:options.maxTokens??commands.getSessionTokenLimit(sessionKey),
    maxInputTokens:options.maxInputTokens??commands.getSessionInputLimit(sessionKey),
    reserveOutputTokens:
      options.reserveOutputTokens??
      reserveFromRequest??
      commands.getSessionOutputReserve(sessionKey),
  };
}

function compressAndRecord(messages,sessionKey,options={}){
  const resolved=resolveOptions(sessionKey,options);
  const repaired=transcriptRepair.repair(messages);
  const compressed=compressor.compressMessages(repaired.messages,resolved);
  const invariantReport=invariants.evaluate(repaired.messages,compressed,{maxChars:resolved.maxChars,maxTokens:resolved.maxTokens});
  if(options.strictInvariants===true&&!invariantReport.valid) invariants.assert(repaired.messages,compressed,{maxChars:resolved.maxChars,maxTokens:resolved.maxTokens});
  const report=compressionReport.publicReport(
    compressionReport.buildCompressionReport(repaired.messages,compressed,{
      maxChars:resolved.maxChars,
      maxTokens:resolved.maxTokens,
      maxInputTokens:resolved.maxInputTokens,
      reserveOutputTokens:resolved.reserveOutputTokens,
    })
  );
  report.invariants=invariantReport;
  report.transcriptRepair={repaired:repaired.repaired};
  if(report.savings?.tokens>0) awareness.record(sessionKey,report);
  runtimeMetrics.touch(sessionKey,report);
  return {messages:compressed,report,options:resolved,invariants:invariantReport};
}

module.exports={requestOutputReserve,resolveOptions,compressAndRecord};
