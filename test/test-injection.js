const fs = require('fs');
const path = require('path');
const os = require('os');
const testMemoPath = path.join(os.tmpdir(), `test-model-memo-${Date.now()}.json`);
process.env.MEMO_FILE = testMemoPath;

const assert = require('assert');
const { opencodeInjection, memoStore, compressor } = require('../src/plugin');

console.log('=== Testing opencode-model-memo Plugin & Hook Injection ===');

// 1. Test In-Chat Command Interception
const commandInput = [{ role: 'user', content: '$context-compressor off' }];
const cmdResult = opencodeInjection(commandInput, { sessionKey: 'test-session-1' });

assert.strictEqual(cmdResult.intercepted, true, 'Command should be intercepted before LLM');
assert.ok(cmdResult.replyText.includes('DISABLED'), 'Reply should confirm disabled status');
console.log('✓ In-Chat Command Interception: PASS');

// 2. Test Command Filtering from Context
const conversationWithCmd = [
  { role: 'user', content: 'Create a website' },
  { role: 'assistant', content: 'Creating website...' },
  { role: 'user', content: '$context-compressor status' },
  { role: 'assistant', content: '⚡ **ModelMemo Compressor Status**...' },
  { role: 'user', content: 'Now write HTML' },
];

const cleaned = compressor.stripCommands(conversationWithCmd);
assert.strictEqual(cleaned.length, 3, 'Command turn should be stripped from LLM context');
assert.strictEqual(cleaned[0].content, 'Create a website');
assert.strictEqual(cleaned[2].content, 'Now write HTML');
console.log('✓ Command Context Stripping: PASS');

// 3. Test Persistent Timeline Memory Sync & Recall
memoStore.syncMessages('test-session-2', [
  { role: 'user', content: 'Project Kanban App initiated.' },
  { role: 'tool', name: 'write_file', content: 'Writing index.html...' },
  { role: 'assistant', content: 'Kanban App structure ready.' },
]);

const recallResult = memoStore.recall('test-session-2', 'kanban first', 1000);
assert.ok(recallResult.includes('Kanban App'), 'Recall should find Kanban App checkpoint');
console.log('✓ Persistent Timeline Memory Sync & Recall: PASS');

try { fs.unlinkSync(testMemoPath); } catch (_) {}

console.log('\nALL INJECTION & MEMORY TESTS PASSED SUCCESSFULLY! 🎉');
