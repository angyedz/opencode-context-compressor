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
  hasStructuredContent,
  semanticFacts,
  collectRankedAnchors,
  scoreFact,
  buildStateSnapshot,
} = require('../src/compressor');

test('semantic anchor extractor recognizes implementation-critical facts', () => {
  const userFacts = semanticFacts('Implement src/auth/session.js. Decision: session TTL must be 900 seconds. TODO preserve refresh behavior.');
  const assistantFacts = semanticFacts('Added function validateSession(token) and endpoint /v1/session. Tests failed with Error: expired token accepted.');
  assert.match(userFacts, /src\/auth\/session\.js/);
  assert.match(userFacts, /900 seconds/);
  assert.match(assistantFacts, /validateSession/);
  assert.match(assistantFacts, /expired token accepted/);
});

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


test('compression ratio is extreme on stale tool-heavy history without touching current request', () => {
  const messages = [{ role: 'system', content: 'coding agent' }];
  for (let i = 0; i < 80; i += 1) {
    messages.push({ role: 'user', content: 'inspect build state ' + i });
    messages.push({ role: 'assistant', content: 'checking logs', tool_calls: [{ id: 'c' + i, type: 'function', function: { name: 'shell', arguments: '{"cmd":"test"}' } }] });
    messages.push({ role: 'tool', tool_call_id: 'c' + i, name: 'shell', content: ('progress line\\n').repeat(700) + 'RESULT=' + i });
    messages.push({ role: 'assistant', content: 'result ' + i + ' recorded' });
  }
  const current = 'CURRENT REQUEST EXACT';
  messages.push({ role: 'user', content: current });

  const before = messagesSize(messages);
  const compressed = compressMessages(messages, { maxChars: 6000 });
  const after = messagesSize(compressed);

  assert.equal(compressed[compressed.length - 1].content, current);
  assert.ok(after < before / 20, 'expected at least 20x request-size reduction on synthetic stale logs');
  assert.ok(messagesSize(historicalMessages(compressed)) <= 6000);
});


test('structured multimodal and Anthropic-style blocks are byte-for-byte preserved when retained', () => {
  const structured = {
    role: 'user',
    content: [
      { type: 'text', text: 'inspect this image' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
    ],
  };
  const toolUse = {
    role: 'assistant',
    content: [{ type: 'tool_use', id: 'toolu_1', name: 'read_file', input: { path: 'a.js' } }],
  };
  const input = [];
  for (let i = 0; i < 10; i += 1) {
    input.push({ role: 'user', content: 'noise ' + 'x'.repeat(1000) });
    input.push({ role: 'assistant', content: 'noise reply ' + 'y'.repeat(1000) });
  }
  input.push(structured, toolUse, {
    role: 'user',
    content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok' }],
  }, { role: 'assistant', content: 'done' }, { role: 'user', content: 'continue' });

  const out = compressMessages(input, { maxChars: 9000 });
  const retainedStructured = out.find((m) => Array.isArray(m.content) && m.content.some((p) => p?.type === 'image'));
  const retainedTool = out.find((m) => Array.isArray(m.content) && m.content.some((p) => p?.type === 'tool_use'));
  assert.deepEqual(retainedStructured, structured);
  assert.deepEqual(retainedTool, toolUse);
});


test('cold summaries retain implementation anchors needed by later coding turns', () => {
  const messages = [];
  messages.push({ role: 'user', content: 'Implement src/auth/session.js. Decision: session TTL must be 900 seconds. TODO preserve refresh behavior.' });
  messages.push({ role: 'assistant', content: 'Added function validateSession(token) and endpoint /v1/session. Tests failed with Error: expired token accepted.' });
  for (let i = 0; i < 18; i += 1) {
    messages.push({ role: 'user', content: 'intermediate task ' + i + ' ' + 'x'.repeat(700) });
    messages.push({ role: 'assistant', content: 'intermediate result ' + i + ' ' + 'y'.repeat(700) });
  }
  messages.push({ role: 'user', content: 'Now fix the original auth issue without changing its contract.' });

  const out = compressMessages(messages, { maxChars: 7000 });
  const serialized = JSON.stringify(out);
  assert.ok(serialized.includes('src/auth/session.js'));
  assert.match(serialized, /validateSession/);
  assert.match(serialized, /expired token accepted/);
  assert.match(serialized, /900 seconds/);
  assert.equal(out[out.length - 1].content, 'Now fix the original auth issue without changing its contract.');
});


test('Gemini function and inline-data parts are treated as structured protocol content', () => {
  const functionMessage = { role: 'assistant', content: [{ functionCall: { name: 'read_file', args: { path: 'src/x.js' } } }] };
  const responseMessage = { role: 'user', content: [{ functionResponse: { name: 'read_file', response: { result: 'ok' } } }] };
  const imageMessage = { role: 'user', content: [{ inlineData: { mimeType: 'image/png', data: 'AAAA' } }] };

  assert.equal(hasStructuredContent(functionMessage), true);
  assert.equal(hasStructuredContent(responseMessage), true);
  assert.equal(hasStructuredContent(imageMessage), true);
});


test('importance ranking prefers failures, contracts and active-task dependencies over chatter', () => {
  const turns = [
    [{ role: 'user', content: 'General discussion about colors and formatting.' }],
    [{ role: 'assistant', content: 'Decision: src/auth/session.js API contract must keep validateSession(token). Tests failed with Error: expired token accepted.' }],
    [{ role: 'assistant', content: 'TODO update unrelated README wording someday.' }],
  ];
  const ranked = collectRankedAnchors(turns, 'Fix validateSession in src/auth/session.js without breaking the API', 8);
  const joined = ranked.join('\n');
  assert.match(joined, /src\/auth\/session\.js/);
  assert.match(joined, /expired token accepted/);
  assert.ok(scoreFact('Error: expired token accepted', 'fix expired token') > scoreFact('general formatting note', 'fix expired token'));
});

test('duplicate semantic anchors are collapsed before consuming summary budget', () => {
  const repeated = Array.from({ length: 20 }, () => [
    { role: 'assistant', content: 'Decision: src/api/client.js API contract must remain unchanged.' },
  ]);
  const anchors = collectRankedAnchors(repeated, 'continue src/api/client.js', 24);
  assert.equal(anchors.filter((x) => x.includes('src/api/client.js')).length, 1);
});


test('working-state snapshot separates blockers, constraints and pending work', () => {
  const turns = [[
    { role: 'assistant', content: 'Error: refresh token regression failed. Decision: API contract must remain compatible. TODO add expiry regression test. Implemented src/auth/session.js.' },
  ]];
  const snapshot = buildStateSnapshot(turns, 'fix auth refresh regression');
  assert.match(snapshot, /blockers:/);
  assert.match(snapshot, /constraints:/);
  assert.match(snapshot, /pending:/);
});
