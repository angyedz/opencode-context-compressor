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

test('parallel sessions remain isolated without leaking into each other', () => {
  memoStore.clear('session-a');
  memoStore.clear('session-b');

  memoStore.syncMessages('session-a', [
    { role: 'user', content: 'ALPHA_SESSION_DETAIL' },
    { role: 'assistant', content: 'alpha answer' },
  ]);
  memoStore.syncMessages('session-b', [
    { role: 'user', content: 'BETA_ACTIVE_DETAIL' },
    { role: 'assistant', content: 'beta answer' },
  ]);

  const alpha = memoStore.recall('session-a', 'alpha', 2000);
  const beta = memoStore.recall('session-b', 'beta', 2000);
  assert.match(alpha, /ALPHA_SESSION_DETAIL/);
  assert.doesNotMatch(alpha, /BETA_ACTIVE_DETAIL/);
  assert.match(beta, /BETA_ACTIVE_DETAIL/);
  assert.doesNotMatch(beta, /ALPHA_SESSION_DETAIL/);
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
  assert.doesNotMatch(disk, /ALPHA_SESSION_DETAIL/);
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

  const switchedModel = memoStore.deriveSessionKey(
    [{ role: 'user', content: 'build a parser' }],
    { provider: 'different-provider.example', model: 'model-b' }
  );
  assert.equal(a1, switchedModel);
});
