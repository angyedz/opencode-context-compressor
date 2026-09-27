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
}={}){
  const maxInput=positiveNumber(maxInputTokens,null);
  const reserve=Math.max(0,positiveNumber(reserveOutputTokens,4096));
  const systemTokens=estimateMessagesTokens(systemMessages);
  const activeTokens=estimateMessagesTokens(activeTurn);
  const directive=Math.max(0,positiveNumber(directiveTokens,320));
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
  };
}

function historyCharBudgetFromEnvelope(plan,{charsPerToken=3.2,minChars=800,maxChars=Infinity}={}){
  if(!plan?.bounded||plan.availableHistoryTokens===null||plan.availableHistoryTokens===undefined) return maxChars;
  if(plan.availableHistoryTokens<=0) return 0;
  return Math.max(minChars,Math.min(maxChars,Math.floor(plan.availableHistoryTokens*charsPerToken)));
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
  ].join(' ');
}

module.exports={positiveNumber,planInputEnvelope,historyCharBudgetFromEnvelope,envelopeReport};
