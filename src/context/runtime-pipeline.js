'use strict';

const compressor=require('../compressor');
const commands=require('../commands');
const compressionReport=require('./compression-report');
const runtimeMetrics=require('./runtime-metrics');

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
  return {
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
  const compressed=compressor.compressMessages(messages,resolved);
  const report=compressionReport.publicReport(
    compressionReport.buildCompressionReport(messages,compressed,{
      maxChars:resolved.maxChars,
      maxTokens:resolved.maxTokens,
      maxInputTokens:resolved.maxInputTokens,
      reserveOutputTokens:resolved.reserveOutputTokens,
    })
  );
  runtimeMetrics.touch(sessionKey,report);
  return {messages:compressed,report,options:resolved};
}

module.exports={requestOutputReserve,resolveOptions,compressAndRecord};
