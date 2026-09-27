'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = path.join(os.tmpdir(), 'occ-memo-test-' + process.pid);
process.env.SESSION_DIR = dir;
process.env.SESSION_FILE = path.join(dir, 'sessions.json');
const memo = require('../src/memo-store');

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

test('parallel sessions retain isolated recall', () => {
  memo.syncMessages('alpha', [{ role: 'user', content: 'ALPHA unique constraint' }, { role: 'assistant', content: 'alpha done' }]);
  memo.syncMessages('beta', [{ role: 'user', content: 'BETA unique constraint' }, { role: 'assistant', content: 'beta done' }]);

  assert.match(memo.recall('alpha', 'unique', 1000), /ALPHA/);
  assert.doesNotMatch(memo.recall('alpha', 'unique', 1000), /BETA/);
  assert.match(memo.recall('beta', 'unique', 1000), /BETA/);
  assert.equal(memo.stats().sessions, 2);
});

test('clearing one session does not destroy another', () => {
  memo.clear('alpha');
  assert.match(memo.recall('beta', 'unique', 1000), /BETA/);
  assert.equal(memo.stats().sessions, 1);
});

test('session file is owner-only on POSIX', () => {
  if (process.platform !== 'win32') {
    const mode = fs.statSync(process.env.SESSION_FILE).mode & 0o777;
    assert.equal(mode, 0o600);
  }
});
