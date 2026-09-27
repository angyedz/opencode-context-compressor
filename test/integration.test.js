'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');

process.env.PROFILE_FILE = path.join(os.tmpdir(), 'occ-cmd-profile-' + process.pid + '.json');
process.env.SESSION_FILE = path.join(os.tmpdir(), 'occ-cmd-session-' + process.pid + '.json');

const commands = require('../src/commands');
const plugin = require('../src/plugin');

test('all documented local commands are intercepted without an LLM call', () => {
  for (const text of ['$compressor status', '$history', '$search build', '$memo', '$remember preference concise replies', '$profile']) {
    assert.equal(commands.isCommandMessage([{ role: 'user', content: text }]), true, text);
  }
});

test('session limits are isolated', () => {
  commands.executeCommand([{ role: 'user', content: '$compressor limit 8k' }], 'a');
  commands.executeCommand([{ role: 'user', content: '$compressor limit 32k' }], 'b');
  assert.equal(commands.getSessionLimit('a'), 8000);
  assert.equal(commands.getSessionLimit('b'), 32000);
});

test('native injection preserves current request exactly while applying configured budget', () => {
  const messages = [];
  for (let i = 0; i < 20; i += 1) {
    messages.push({ role: 'user', content: 'old ' + i + ' ' + 'x'.repeat(1200) });
    messages.push({ role: 'assistant', content: 'reply ' + i + ' ' + 'y'.repeat(1400) });
  }
  messages.push({ role: 'user', content: 'DO THIS EXACTLY NOW' });
  commands.executeCommand([{ role: 'user', content: '$compressor limit 8k' }], 'native-a');
  const out = plugin.opencodeInjection(messages, { sessionKey: 'native-a' });
  assert.equal(out.intercepted, false);
  assert.equal(out.messages[out.messages.length - 1].content, 'DO THIS EXACTLY NOW');
});
