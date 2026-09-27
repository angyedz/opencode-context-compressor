'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function source(relative) {
  return fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
}

test('proxy verifies upstream TLS and only listens on loopback', () => {
  const proxy = source('src/proxy.js');
  assert.match(proxy, /rejectUnauthorized:\s*true/);
  assert.match(proxy, /proxyServer\.listen\(PORT, '127\.0\.0\.1'/);
  assert.doesNotMatch(proxy, /proxyServer\.listen\(PORT, '0\.0\.0\.0'/);
});

test('installer does not modify the global CA trust store by default', () => {
  const cli = source('bin/cli.js');
  assert.doesNotMatch(cli, /sudo\s+cp\s+.*ca\.crt/);
  assert.match(cli, /System trust store was NOT modified/);
});

test('root CA private key is created with restrictive permissions', () => {
  const ca = source('src/ca.js');
  assert.match(ca, /CA_KEY_PATH[\s\S]*mode:\s*0o600/);
});


test('launcher is cross-platform and installer contains no systemd dependency', () => {
  const cli = source('bin/cli.js');
  const launcher = source('bin/opencode-cc.js');
  assert.doesNotMatch(cli, /systemctl|systemd/);
  assert.match(launcher, /process\.platform === 'win32'/);
  assert.match(launcher, /waitForProxy/);
  assert.match(launcher, /NODE_EXTRA_CA_CERTS/);
});

test('launcher bypasses local OpenCode traffic and uses standalone mode for provider requests', () => {
  const { mergeNoProxy, buildOpenCodeArgs } = require('../bin/opencode-cc');
  const bypass = mergeNoProxy({ NO_PROXY: 'example.internal' });
  assert.match(bypass.NO_PROXY, /localhost/);
  assert.match(bypass.NO_PROXY, /127\.0\.0\.1/);
  assert.match(bypass.NO_PROXY, /::1/);
  assert.deepEqual(buildOpenCodeArgs([], true), ['--standalone']);
  assert.deepEqual(buildOpenCodeArgs(['run', 'hello'], true), ['run', '--standalone', 'hello']);
  assert.deepEqual(buildOpenCodeArgs(['serve'], true), ['serve']);
  assert.deepEqual(buildOpenCodeArgs(['--server', 'http://127.0.0.1:4096'], true), ['--server', 'http://127.0.0.1:4096']);
});

test('proxy strips conflicting hop-by-hop framing headers', () => {
  const proxy = source('src/proxy.js');
  assert.match(proxy, /delete forwardHeaders\['transfer-encoding'\]/);
  assert.match(proxy, /delete forwardHeaders\['connection'\]/);
  assert.match(proxy, /delete forwardHeaders\['keep-alive'\]/);
});

test('leaf certificates use random hexadecimal serials instead of floating-point timestamps', () => {
  const ca = source('src/ca.js');
  assert.match(ca, /crypto\.randomBytes\(16\)\.toString\('hex'\)/);
  assert.doesNotMatch(ca, /Date\.now\(\) \+ Math\.random\(\)/);
  assert.match(ca, /serverAuth:\s*true/);
});
