'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function source(file) { return fs.readFileSync(path.join(__dirname, '..', file), 'utf8'); }

test('runtime and command paths contain no systemd or bash dependency', () => {
  for (const file of ['bin/cli.js', 'bin/opencode-cc.js', 'src/commands.js']) {
    const text = source(file);
    assert.doesNotMatch(text, /systemctl|systemd|\/bin\/bash/, file);
  }
});

test('package exposes one-command opencode-cc launcher', () => {
  const pkg = JSON.parse(source('package.json'));
  assert.equal(pkg.bin['opencode-cc'], 'bin/opencode-cc.js');
});

test('MCP temporary recall supports explicit concurrent-session routing', () => {
  const mcp = source('src/mcp-server.js');
  assert.match(mcp, /session_id/);
  assert.match(mcp, /memoStore\.recall\(args\.session_id \|\| null/);
});


test('launcher verifies proxy identity and can move away from an occupied default port', () => {
  const launcher = source('bin/opencode-cc.js');
  assert.match(launcher, /context-compressor-proxy/);
  assert.match(launcher, /freePort/);
  assert.match(launcher, /PROXY_PORT: String\(proxyPort\)/);
});

test('CI executes on Linux macOS and Windows', () => {
  const workflow = source('.github/workflows/ci.yml');
  assert.match(workflow, /ubuntu-latest/);
  assert.match(workflow, /macos-latest/);
  assert.match(workflow, /windows-latest/);
  assert.doesNotMatch(workflow, /shell:\s*bash/);
});
