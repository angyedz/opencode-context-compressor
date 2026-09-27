'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = path.join(os.tmpdir(), 'occ-memo-test-' + process.pid);
process.env.SESSION_DIR = dir;
process.env.SESSION_FILE = path.join(dir, 'sessions.json');
process.env.SESSION_TTL_MS = '100';

const memo = require('../src/memo-store');

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

test('two active sessions retain independent recall', () => {
  memo.syncMessages('alpha', [
    { role: 'user', content: 'alpha unique request' },
    { role: 'assistant', content: 'alpha unique result' },
  ]);
  memo.syncMessages('beta', [
    { role: 'user', content: 'beta unique request' },
    { role: 'assistant', content: 'beta unique result' },
  ]);

  assert.match(memo.recall('alpha', 'unique', 1200), /alpha unique/);
  assert.doesNotMatch(memo.recall('alpha', 'unique', 1200), /beta unique/);
  assert.match(memo.recall('beta', 'unique', 1200), /beta unique/);
  assert.equal(memo.stats().sessions, 2);
});

test('clearing one session does not clear another', () => {
  memo.clear('alpha');
  assert.match(memo.recall('alpha', 'recent', 800), /No active-session checkpoints/);
  assert.match(memo.recall('beta', 'recent', 800), /beta unique/);
});

test('session store is owner-only on POSIX', () => {
  memo.saveExplicit('beta', 'temporary note');
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(process.env.SESSION_FILE).mode & 0o777, 0o600);
  }
});
