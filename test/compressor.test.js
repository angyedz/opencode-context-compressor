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
  factEntities,
  recentBudgetRatio,
  lifecycleState,
  stableTextFingerprint,
  collapseRepeatedToolOutputs,
  rescueRelevantTurns,
  estimateTokens,
  validateToolProtocol,
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


test('entity relevance strongly promotes the exact file/function needed by the active task', () => {
  const related = 'Error: src/auth/session.js validateSession(token) rejects refresh tokens.';
  const unrelated = 'Error: src/ui/theme.js renderTheme(config) failed snapshot test.';
  assert.ok(
    scoreFact(related, 'Fix validateSession(token) in src/auth/session.js') >
    scoreFact(unrelated, 'Fix validateSession(token) in src/auth/session.js')
  );
  assert.ok(factEntities(related).some((x) => x.includes('src/auth/session.js')));
});

test('newer facts supersede stale facts about the same entity/topic', () => {
  const turns = [
    [{ role: 'assistant', content: 'Decision: src/server/config.js port must be 3000.' }],
    [{ role: 'assistant', content: 'Decision: src/server/config.js port must be 8080.' }],
  ];
  const anchors = collectRankedAnchors(turns, 'continue src/server/config.js', 10).join('\n');
  assert.match(anchors, /8080/);
  assert.doesNotMatch(anchors, /3000/);
});


test('adaptive hot window spends less exact budget on giant tool logs and more on short turns', () => {
  const concise = Array.from({length:4}, (_,i) => [
    { role:'user', content:'edit '+i },
    { role:'assistant', content:'done '+i },
  ]);
  const noisy = Array.from({length:4}, (_,i) => [
    { role:'user', content:'run '+i },
    { role:'assistant', content:'tool', tool_calls:[{id:'x'+i,type:'function',function:{name:'shell',arguments:'{}'}}] },
    { role:'tool', tool_call_id:'x'+i, content:'log '.repeat(4000) },
  ]);
  assert.ok(recentBudgetRatio(concise, 16000) > recentBudgetRatio(noisy, 16000));
});


test('resolved failures do not survive forever as active blockers', () => {
  const turns = [
    [{ role:'assistant', content:'Error: src/auth/session.js refresh regression failed.' }],
    [{ role:'assistant', content:'Fixed src/auth/session.js refresh regression. Tests passed.' }],
  ];
  const anchors=collectRankedAnchors(turns,'continue src/auth/session.js',20).join('\n');
  assert.match(anchors,/passed|Fixed/i);
  assert.doesNotMatch(anchors,/Error:.*failed/i);
  assert.equal(lifecycleState('Tests passed after fix'),'resolved');
});

test('completed TODO is suppressed from pending historical state', () => {
  const turns = [
    [{ role:'assistant', content:'TODO: add regression test for src/cache/store.js.' }],
    [{ role:'assistant', content:'Completed regression test for src/cache/store.js. Tests passed.' }],
  ];
  const snapshot=buildStateSnapshot(turns,'continue src/cache/store.js');
  assert.doesNotMatch(snapshot,/pending:.*TODO/i);
});


test('anchor selection preserves diversity instead of letting one noisy file consume the state', () => {
  const turns=[];
  for(let i=0;i<12;i++) turns.push([{role:'assistant',content:`TODO: src/auth/session.js auth issue ${i} must be fixed.`}]);
  turns.push([{role:'assistant',content:'Decision: src/db/store.js schema contract must remain compatible.'}]);
  turns.push([{role:'assistant',content:'Error: src/api/router.js endpoint /v1/users failed integration test.'}]);
  const anchors=collectRankedAnchors(turns,'continue project',10).join('\n');
  assert.match(anchors,/src\/db\/store\.js/);
  assert.match(anchors,/src\/api\/router\.js/);
});


test('repeated tool outputs collapse while the newest equivalent result remains exact', () => {
  const turns=[];
  for(let i=0;i<12;i++) turns.push([
    {role:'user',content:'run tests again'},
    {role:'assistant',content:'running',tool_calls:[{id:'c'+i,type:'function',function:{name:'shell',arguments:'{}'}}]},
    {role:'tool',name:'shell',tool_call_id:'c'+i,content:'12:30:0'+(i%10)+' npm test\nPASS 42 tests in 1.2s'},
    {role:'assistant',content:'Tests passed.'},
  ]);
  const collapsed=collapseRepeatedToolOutputs(turns);
  const toolTexts=collapsed.flat().filter(m=>m.role==='tool').map(m=>String(m.content));
  assert.ok(toolTexts.filter(x=>x.includes('PASS 42 tests')).length <= 2);
  assert.ok(toolTexts.some(x=>x.includes('latest equivalent result retained')));
  assert.equal(stableTextFingerprint('12:30:01 PASS in 1.2s'), stableTextFingerprint('12:30:09 PASS in 9.8s'));
});


test('working state preserves failed approaches so the agent does not loop', () => {
  const turns=[
    [{role:'assistant',content:'Attempted workaround: disable TLS verification in src/net/client.js. It failed and did not work.'}],
    [{role:'assistant',content:'TODO find a safe certificate-chain fix for src/net/client.js.'}],
  ];
  const snapshot=buildStateSnapshot(turns,'fix src/net/client.js TLS');
  assert.match(snapshot,/failed_attempts:/);
  assert.match(snapshot,/disable TLS verification/i);
});


test('old compact turn is rescued when it directly matches active file/function entities', () => {
  const turns=[
    [{role:'user',content:'Edit src/auth/session.js validateSession(token).'}, {role:'assistant',content:'The edge case is refresh-token expiry ordering.'}],
    ...Array.from({length:12},(_,i)=>[{role:'user',content:'unrelated '+i},{role:'assistant',content:'done '+i}]),
  ];
  const rescued=rescueRelevantTurns(turns,'Fix validateSession(token) in src/auth/session.js',3000);
  assert.ok(rescued.length>=1);
  assert.match(JSON.stringify(rescued[0]),/refresh-token expiry ordering/);
});


test('token estimator charges dense unicode/code differently from plain character count', () => {
  assert.ok(estimateTokens('hello world') > 0);
  assert.ok(estimateTokens('const x = foo(bar);') > 0);
  assert.ok(estimateTokens('你好世界你好世界') >= 8);
});

test('tool protocol validator catches orphan OpenAI and Anthropic results', () => {
  assert.equal(validateToolProtocol([
    {role:'assistant',tool_calls:[{id:'c1',type:'function',function:{name:'x',arguments:'{}'}}]},
    {role:'tool',tool_call_id:'c1',content:'ok'},
  ]).valid,true);
  assert.equal(validateToolProtocol([{role:'tool',tool_call_id:'missing',content:'oops'}]).valid,false);
  assert.equal(validateToolProtocol([{role:'user',content:[{type:'tool_result',tool_use_id:'missing',content:'oops'}]}]).valid,false);
});
