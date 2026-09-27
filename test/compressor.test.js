'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');

process.env.PROFILE_FILE = path.join(os.tmpdir(), 'occ-test-profile-' + process.pid + '.json');

const {
  compressMessages,
  messagesSize,
  splitTurns,
  stripCommands,
} = require('../src/compressor');

function historicalMessages(messages) {
  const nonSystem = messages.filter((message) => message.role !== 'system');
  const turns = splitTurns(nonSystem);
  return turns.slice(0, -1).flat();
}

test('historical context stays inside configured budget while current turn remains exact', () => {
  const messages = [{ role: 'system', content: 'You are a coding agent.' }];

  for (let i = 0; i < 12; i += 1) {
    messages.push({ role: 'user', content: 'user-' + i + ' ' + 'u'.repeat(1400) });
    messages.push({ role: 'assistant', content: 'assistant-' + i + ' ' + 'a'.repeat(1800) });
  }

  const current = 'FINAL CURRENT REQUEST MUST REMAIN EXACT';
  messages.push({ role: 'user', content: current });

  const compressed = compressMessages(messages, { maxChars: 6000 });
  const historical = historicalMessages(compressed);

  assert.ok(messagesSize(historical) <= 6000, 'historical payload exceeded configured budget');
  assert.equal(compressed[compressed.length - 1].content, current);
  assert.ok(
    compressed.some((message) => String(message.content).includes('Compacted prior conversation')),
    'expected compacted history marker'
  );
});

test('recent OpenAI tool call sequence stays atomic', () => {
  const messages = [];

  for (let i = 0; i < 8; i += 1) {
    messages.push({ role: 'user', content: 'old request ' + i + ' ' + 'x'.repeat(900) });
    messages.push({ role: 'assistant', content: 'old response ' + i + ' ' + 'y'.repeat(1000) });
  }

  messages.push({ role: 'user', content: 'Run the build tool now.' });
  messages.push({
    role: 'assistant',
    content: '',
    tool_calls: [{
      id: 'call-build-1',
      type: 'function',
      function: { name: 'run_build', arguments: '{"target":"all"}' },
    }],
  });
  messages.push({
    role: 'tool',
    tool_call_id: 'call-build-1',
    name: 'run_build',
    content: 'BUILD OK\n' + 'log '.repeat(250),
  });
  messages.push({ role: 'assistant', content: 'Build completed successfully.' });
  messages.push({ role: 'user', content: 'What should I do next?' });

  const compressed = compressMessages(messages, { maxChars: 7000 });
  const call = compressed.find((message) => message.tool_calls?.[0]?.id === 'call-build-1');
  const result = compressed.find((message) => message.tool_call_id === 'call-build-1');

  assert.ok(call, 'assistant tool call was lost');
  assert.ok(result, 'matching tool result was lost');
});

test('ordinary assistant messages containing emoji are not mistaken for compressor replies', () => {
  const input = [
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: '⚡ normal answer that must remain' },
    { role: 'user', content: '$compressor status' },
    { role: 'assistant', content: 'local command response' },
    { role: 'user', content: 'continue' },
  ];

  const output = stripCommands(input);
  assert.equal(output.length, 3);
  assert.equal(output[1].content, '⚡ normal answer that must remain');
});
