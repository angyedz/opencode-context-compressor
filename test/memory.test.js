'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(os.tmpdir(), 'occ-memory-test-' + process.pid);
process.env.SESSION_DIR = root;
process.env.SESSION_FILE = path.join(root, 'active-session.json');
process.env.PROFILE_DIR = root;
process.env.PROFILE_FILE = path.join(root, 'profile.json');

const memoStore = require('../src/memo-store');
const profileStore = require('../src/profile-store');

test('switching sessions replaces full conversation memory instead of retaining old chat history', () => {
  memoStore.clear();

  memoStore.syncMessages('session-a', [
    { role: 'user', content: 'ALPHA_SECRET_SESSION_DETAIL' },
    { role: 'assistant', content: 'alpha answer' },
  ]);
  assert.match(memoStore.recall(null, 'alpha', 2000), /ALPHA_SECRET_SESSION_DETAIL/);

  memoStore.syncMessages('session-b', [
    { role: 'user', content: 'BETA_ACTIVE_DETAIL' },
    { role: 'assistant', content: 'beta answer' },
  ]);

  const old = memoStore.recall('session-a', 'alpha', 2000);
  const active = memoStore.recall(null, 'beta', 2000);

  assert.match(old, /not active/i);
  assert.doesNotMatch(active, /ALPHA_SECRET_SESSION_DETAIL/);
  assert.match(active, /BETA_ACTIVE_DETAIL/);
});

test('durable profile stores only explicitly remembered concise facts', () => {
  profileStore.clear();
  profileStore.remember('Prefers concise technical answers.', 'preference');
  profileStore.remember('Project uses Node.js 20 in CI.', 'environment');

  const facts = profileStore.list();
  assert.equal(facts.length, 2);
  assert.ok(facts.some((fact) => fact.category === 'preference'));
  assert.ok(facts.some((fact) => fact.text.includes('Node.js 20')));

  const disk = fs.readFileSync(process.env.PROFILE_FILE, 'utf8');
  assert.doesNotMatch(disk, /ALPHA_SECRET_SESSION_DETAIL/);
  assert.match(disk, /Prefers concise technical answers/);
});

test('session id derivation is stable for one conversation and changes with the first user request', () => {
  const a1 = memoStore.deriveSessionKey(
    [{ role: 'user', content: 'build a parser' }],
    { provider: 'api.example', model: 'model-a' }
  );
  const a2 = memoStore.deriveSessionKey(
    [
      { role: 'user', content: 'build a parser' },
      { role: 'assistant', content: 'done' },
      { role: 'user', content: 'now add tests' },
    ],
    { provider: 'api.example', model: 'model-a' }
  );
  const b = memoStore.deriveSessionKey(
    [{ role: 'user', content: 'build a compiler' }],
    { provider: 'api.example', model: 'model-a' }
  );

  assert.equal(a1, a2);
  assert.notEqual(a1, b);
});
