'use strict';

const { compressMessages, messagesSize } = require('../src/compressor');

function makeSession(turns = 120) {
  const messages = [{ role: 'system', content: 'You are a coding agent. Preserve project constraints.' }];
  for (let i = 0; i < turns; i += 1) {
    messages.push({ role: 'user', content: `Task ${i}: inspect src/module-${i % 9}.js and keep API compatibility.` });
    messages.push({
      role: 'assistant',
      content: `Checking module ${i}.`,
      tool_calls: [{ id: `call-${i}`, type: 'function', function: { name: 'shell', arguments: JSON.stringify({ cmd: 'npm test' }) } }],
    });
    messages.push({
      role: 'tool',
      tool_call_id: `call-${i}`,
      name: 'shell',
      content: (`test suite ${i}: progress output that is no longer useful\n`).repeat(240) + `RESULT ${i}: ok\n`,
    });
    messages.push({ role: 'assistant', content: `Decision: module-${i % 9} public signature remains unchanged. TODO keep regression test ${i}.` });
  }
  messages.push({ role: 'user', content: 'Continue the project. Preserve all current API contracts.' });
  return messages;
}

function run(budget) {
  const input = makeSession();
  const output = compressMessages(input, { maxChars: budget });
  const raw = messagesSize(input);
  const compressed = messagesSize(output);
  return {
    budget,
    rawChars: raw,
    compressedChars: compressed,
    ratio: Number((raw / compressed).toFixed(2)),
    reductionPercent: Number(((1 - compressed / raw) * 100).toFixed(2)),
    currentTurnExact: output[output.length - 1].content === input[input.length - 1].content,
  };
}

const budgets = process.argv.slice(2).map(Number).filter(Number.isFinite);
const results = (budgets.length ? budgets : [8000, 16000, 32000, 55000]).map(run);
console.log(JSON.stringify({ workload: 'synthetic-tool-heavy-120-turns', results }, null, 2));

if (results.some((r) => !r.currentTurnExact)) {
  console.error('benchmark invariant failed: current turn changed');
  process.exitCode = 1;
}
if (results.some((r) => r.reductionPercent < 50)) {
  console.error('benchmark invariant failed: tool-heavy workload compressed by less than 50%');
  process.exitCode = 1;
}
