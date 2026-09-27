'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { compressMessages, messagesSize } = require('../src/compressor');

function rng(seed) {
  let x = seed >>> 0;
  return () => ((x = (1664525 * x + 1013904223) >>> 0) / 0x100000000);
}

test('deterministic fuzz: compressor preserves active turn and never mutates input', () => {
  for (let seed = 1; seed <= 120; seed += 1) {
    const random = rng(seed);
    const messages = [{ role: 'system', content: 'system-' + seed }];
    const turns = 5 + Math.floor(random() * 35);

    for (let i = 0; i < turns; i += 1) {
      messages.push({ role: 'user', content: `request-${seed}-${i} ` + 'u'.repeat(Math.floor(random() * 2400)) });
      if (random() < 0.35) {
        const id = `call-${seed}-${i}`;
        messages.push({ role: 'assistant', content: 'tooling', tool_calls: [{ id, type: 'function', function: { name: 'shell', arguments: '{"cmd":"test"}' } }] });
        messages.push({ role: 'tool', tool_call_id: id, name: 'shell', content: 'log\n'.repeat(20 + Math.floor(random() * 900)) });
      }
      messages.push({ role: 'assistant', content: `reply-${seed}-${i} Decision: preserve API ${i}. ` + 'a'.repeat(Math.floor(random() * 2200)) });
    }

    const active = `ACTIVE-${seed}-EXACT`;
    messages.push({ role: 'user', content: active });
    const snapshot = JSON.stringify(messages);
    const budget = [4000, 8000, 16000, 32000][Math.floor(random() * 4)];
    const out = compressMessages(messages, { maxChars: budget });

    assert.equal(JSON.stringify(messages), snapshot, `input mutated at seed ${seed}`);
    assert.equal(out[out.length - 1].content, active, `active turn changed at seed ${seed}`);
    assert.ok(messagesSize(out) > 0);
  }
});
