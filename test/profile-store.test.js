'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = path.join(os.tmpdir(), 'occ-profile-test-' + process.pid);
process.env.PROFILE_DIR = tmp;
process.env.PROFILE_FILE = path.join(tmp, 'profile.json');

const profile = require('../src/profile-store');

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('durable profile rejects obvious credentials and private keys', () => {
  assert.equal(profile.remember('api_key=super-secret-value-123456789', 'environment').saved, false);
  assert.equal(profile.remember('token: ghp_123456789012345678901234567890123456', 'environment').saved, false);
  assert.equal(profile.remember('-----BEGIN PRIVATE KEY----- abc', 'environment').saved, false);
});

test('durable profile accepts a normal stable preference and deduplicates it', () => {
  const a = profile.remember('Prefer concise commit messages', 'preference');
  const b = profile.remember('Prefer concise commit messages', 'preference');
  assert.equal(a.saved, true);
  assert.equal(b.saved, true);
  assert.equal(b.updated, true);
  assert.equal(profile.list('concise').length, 1);
});

test('profile file is owner-only on POSIX', () => {
  profile.remember('Use Node 18 or newer', 'environment');
  if (process.platform !== 'win32') {
    const mode = fs.statSync(process.env.PROFILE_FILE).mode & 0o777;
    assert.equal(mode, 0o600);
  }
});
