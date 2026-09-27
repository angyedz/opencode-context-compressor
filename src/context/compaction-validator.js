'use strict';

const summaryValidator=require('./summary-validator');
const evidence=require('./summary-evidence');

function validate(candidate,sourceMessages,{sourceChars=0,requiredAnchors=[],allowEntities=[]}={}){
 const structural=summaryValidator.validateSummary(candidate,{sourceChars,requiredAnchors});
 const grounded=evidence.verify(candidate,sourceMessages,{allow:allowEntities});
 const checks={...structural.checks,evidenceGrounded:grounded.valid};
 return {
  valid:structural.valid&&grounded.valid,
  checks,
  chars:structural.chars,
  ratio:structural.ratio,
  missingAnchors:structural.missingAnchors,
  unsupportedEntities:grounded.unsupported,
 };
}
function decision(report){
 if(report.valid)return {action:'commit',reason:'validated'};
 if(!report.checks.hasText||!report.checks.notReasoningOnly)return {action:'rollback',reason:'empty-or-reasoning-only'};
 if(!report.checks.evidenceGrounded)return {action:'rollback',reason:'unsupported-summary-entities'};
 if(!report.checks.anchorsPreserved)return {action:'rollback',reason:'critical-anchor-loss'};
 if(!report.checks.actuallyCompressed)return {action:'retry-smaller',reason:'insufficient-compression'};
 return {action:'rollback',reason:'summary-quality-failure'};
}
module.exports={validate,decision};
