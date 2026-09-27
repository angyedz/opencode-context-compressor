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
