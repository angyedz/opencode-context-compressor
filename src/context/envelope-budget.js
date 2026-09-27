'use strict';

const { estimateMessagesTokens } = require('./token-budget');

function positiveNumber(value,fallback=null){
  const n=Number(value);
  return Number.isFinite(n)&&n>0?n:fallback;
}

function planInputEnvelope({
  maxInputTokens=null,
  reserveOutputTokens=4096,
  systemMessages=[],
  activeTurn=[],
  directiveTokens=320,
  requestedHistoryTokens=null,
  minimumHistoryTokens=256,
  tokenScale=1,
}={}){
  const maxInput=positiveNumber(maxInputTokens,null);
  const reserve=Math.max(0,positiveNumber(reserveOutputTokens,4096));
  const scale=Math.max(0.25,Math.min(4,positiveNumber(tokenScale,1)));
  const systemTokens=Math.ceil(estimateMessagesTokens(systemMessages)*scale);
  const activeTokens=Math.ceil(estimateMessagesTokens(activeTurn)*scale);
  const directive=Math.ceil(Math.max(0,positiveNumber(directiveTokens,320))*scale);
  const requested=positiveNumber(requestedHistoryTokens,null);

  if(!maxInput){
    return {
      bounded:false,
      maxInputTokens:null,
      reserveOutputTokens:reserve,
      systemTokens,
      activeTokens,
      directiveTokens:directive,
      requestedHistoryTokens:requested,
      availableHistoryTokens:requested,
      overcommitted:false,
      tokenScale:scale,
    };
  }

  const fixed=systemTokens+activeTokens+directive+reserve;
  const rawAvailable=maxInput-fixed;
  const overcommitted=rawAvailable<0;
  const available=Math.max(0,rawAvailable);
  const history=requested===null?available:Math.min(requested,available);

  return {
    bounded:true,
    maxInputTokens:maxInput,
    reserveOutputTokens:reserve,
    systemTokens,
    activeTokens,
    directiveTokens:directive,
    requestedHistoryTokens:requested,
    availableHistoryTokens:history,
    minimumHistoryTokens,
    overcommitted,
    fixedTokens:fixed,
    headroomTokens:maxInput-(fixed+history),
    tokenScale:scale,
  };
}

function historyCharBudgetFromEnvelope(plan,{charsPerToken=3.2,minChars=800,maxChars=Infinity}={}){
  if(!plan?.bounded||plan.availableHistoryTokens===null||plan.availableHistoryTokens===undefined) return maxChars;
  if(plan.availableHistoryTokens<=0) return 0;
  const scale=Math.max(0.25,Math.min(4,Number(plan.tokenScale)||1));
  const raw=Math.max(0,Math.floor(plan.availableHistoryTokens*(charsPerToken/scale)));
  // Never exceed the actual envelope merely to satisfy a convenience minimum.
  // minChars is advisory only when the envelope can afford it.
  if(raw<minChars) return Math.min(maxChars,raw);
  return Math.min(maxChars,raw);
}

function envelopeReport(plan){
  if(!plan?.bounded) return 'input envelope: unbounded';
  return [
    `input=${plan.maxInputTokens}`,
    `fixed=${plan.fixedTokens}`,
    `history=${plan.availableHistoryTokens}`,
    `reserve=${plan.reserveOutputTokens}`,
    `headroom=${plan.headroomTokens}`,
    `overcommitted=${plan.overcommitted}`,
    `scale=${plan.tokenScale || 1}`,
  ].join(' ');
}

module.exports={positiveNumber,planInputEnvelope,historyCharBudgetFromEnvelope,envelopeReport};
