'use strict';

function reserve({advertisedOutput=0,providerLimit=0,inputTokens=0,minReserve=512,maxFraction=0.25}={}){
 const limit=Math.max(0,Number(providerLimit)||0),advertised=Math.max(0,Number(advertisedOutput)||0),input=Math.max(0,Number(inputTokens)||0);
 if(!limit)return Math.max(minReserve,Math.min(advertised||4096,16384));
 const headroom=Math.max(0,limit-input);
 const fractionCap=Math.max(minReserve,Math.floor(limit*maxFraction));
 return Math.max(minReserve,Math.min(advertised||fractionCap,fractionCap,Math.max(minReserve,headroom)));
}
function compactionEnvelope({providerLimit,inputTokens,advertisedOutput,minReserve=512}={}){
 const outputReserve=reserve({providerLimit,inputTokens,advertisedOutput,minReserve});
 const maxInput=Math.max(minReserve,(Number(providerLimit)||8192)-outputReserve-minReserve);
 return {maxInputTokens:maxInput,outputReserve,total:maxInput+outputReserve+minReserve};
}
module.exports={reserve,compactionEnvelope};
