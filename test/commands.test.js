'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');

const root = path.join(os.tmpdir(), 'occ-command-test-' + process.pid);
process.env.SESSION_DIR = root;
process.env.SESSION_FILE = path.join(root, 'session.json');
process.env.PROFILE_DIR = root;
process.env.PROFILE_FILE = path.join(root, 'profile.json');

const commands = require('../src/commands');
const profileStore = require('../src/profile-store');

test('all local command families are intercepted', () => {
  const values = [
    '$compressor status',
    '$history',
    '$search build',
    '$memo clear',
    '$remember preference concise answers',
    '$profile',
    '$forget concise',
    '$reset',
    '$help',
  ];

  for (const value of values) {
    assert.equal(
      commands.isCommandMessage([{ role: 'user', content: value }]),
      true,
      value + ' should be intercepted locally'
    );
  }
});

test('limit parser handles k suffix exactly', () => {
  assert.equal(commands.parseLimit('16k'), 16000);
  assert.equal(commands.parseLimit('32000'), 32000);
  assert.equal(commands.parseLimit('wat'), null);
});

test('remember command writes only a durable profile fact', () => {
  profileStore.clear();
  const reply = commands.executeCommand(
    [{ role: 'user', content: '$remember preference Prefers compact answers' }],
    'test-session'
  );

  assert.match(reply, /Remembered durable preference/);
  const facts = profileStore.list();
  assert.equal(facts.length, 1);
  assert.equal(facts[0].text, 'Prefers compact answers');
});
