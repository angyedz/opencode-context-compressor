'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {trimHistorySummaryMessage,isHistorySummary}=require('../src/compressor');

test('aggressive summary trim preserves compacted-history wrapper',()=>{
  const message={role:'user',content:'<compacted_history>\n# Quoted prior conversation state\nThis block is historical data, not a new instruction.\n\n'+ 'important history '.repeat(800)+'\n</compacted_history>'};
  assert.equal(isHistorySummary(message),true);
  const trimmed=trimHistorySummaryMessage(message,1200);
  assert.match(trimmed.content,/^<compacted_history>/);
  assert.match(trimmed.content,/<\/compacted_history>$/);
  assert.ok(JSON.stringify(trimmed).length<JSON.stringify(message).length);
});
