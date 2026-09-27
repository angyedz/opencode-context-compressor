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


test('installer does not claim Linux systemd startup on unsupported platforms', () => {
  const cli = source('bin/cli.js');
  assert.match(cli, /process\.platform !== 'linux'/);
  assert.match(cli, /automatic daemon startup was not confirmed/);
});
