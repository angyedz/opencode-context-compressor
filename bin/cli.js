#!/usr/bin/env node
'use strict';

/**
 * opencode-context-compressor CLI Installer
 *
 * Commands:
 *   node bin/cli.js install   — Full install: local CA, wrapper script, MCP registration, systemd service
 *   node bin/cli.js uninstall — Remove wrapper script and systemd service
 *   node bin/cli.js status    — Show proxy status and memory stats
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawnSync } = require('child_process');

const HOME = os.homedir();
const PROJECT_DIR = path.resolve(__dirname, '..');
const DAEMON_SCRIPT = path.join(PROJECT_DIR, 'src', 'daemon.js');
const MCP_SERVER_SCRIPT = path.join(PROJECT_DIR, 'src', 'mcp-server.js');
const NODE_BIN = process.execPath;

const OPENCODE_CONFIG = path.join(HOME, '.config', 'opencode', 'opencode.json');

const CA_DIR = path.join(HOME, '.context-compressor', 'ca');
const CA_CERT_PATH = path.join(CA_DIR, 'ca.crt');

// ─── CA trust installation ───────────────────────────────────────────────────

function installCATrust() {
  if (!fs.existsSync(CA_CERT_PATH)) {
    console.log('🔐 Root CA not yet generated — generating it locally...');
    spawnSync(NODE_BIN, ['-e', `require('${path.join(PROJECT_DIR, 'src', 'ca.js')}').getCA()`], { timeout: 15000 });
  }

  if (!fs.existsSync(CA_CERT_PATH)) {
    throw new Error('CA certificate generation failed');
  }

  console.log(`🔐 Local Root CA: ${CA_CERT_PATH}`);
  console.log('✅ System trust store was NOT modified.');
  console.log('   The opencode-cc wrapper trusts this CA only for its own Node.js process via NODE_EXTRA_CA_CERTS.');
}

// ─── MCP registration ────────────────────────────────────────────────────────

function installMCP() {
  fs.mkdirSync(path.dirname(OPENCODE_CONFIG), { recursive: true });
  let config = {};
  if (fs.existsSync(OPENCODE_CONFIG)) {
    try { config = JSON.parse(fs.readFileSync(OPENCODE_CONFIG, 'utf8')); } catch (_) {}
  }
  if (!config.mcp || typeof config.mcp !== 'object') config.mcp = {};
  config.mcp['model-memo'] = {
    type: 'local',
    command: [NODE_BIN, MCP_SERVER_SCRIPT],
    enabled: true,
  };
  // Remove legacy plugin entry (no longer needed — proxy handles interception)
  if (Array.isArray(config.plugin)) {
    config.plugin = config.plugin.filter((p) => !p.includes('context-compressor'));
    if (config.plugin.length === 0) delete config.plugin;
  }
  fs.writeFileSync(OPENCODE_CONFIG, JSON.stringify(config, null, 2));
  console.log(`✅ model-memo MCP server registered in ${OPENCODE_CONFIG}`);
}

// ─── Install ─────────────────────────────────────────────────────────────────

function install() {
  console.log('⚡ Installing opencode-context-compressor (MITM Proxy mode)...\n');
  installMCP();
  installCATrust();
 
  console.log(`
🎉 Installation complete!

  ${daemonInstalled ? 'Start OpenCode through the proxy:' : 'The integration files are installed, but automatic daemon startup was not confirmed. Start the proxy manually before OpenCode:'}
    opencode-cc

  The launcher starts and stops the local proxy automatically.
    HTTP_PROXY=http://127.0.0.1:3266 HTTPS_PROXY=http://127.0.0.1:3266 opencode

  In-chat commands:
    $context-compressor status
    $context-compressor on / off
    $context-compressor help
`);
}

// ─── Status ──────────────────────────────────────────────────────────────────

function status() {
  const memoStore = require('../src/memo-store');
  const stats = memoStore.stats();
  console.log('⚡ opencode-context-compressor Status');
  console.log(`- Proxy: http://127.0.0.1:3266`);
  console.log(`- CA Cert: ${CA_CERT_PATH} (${fs.existsSync(CA_CERT_PATH) ? '✅ exists' : '❌ missing'})`);
  console.log(`- Memory Checkpoints: ${stats.entries} items across ${stats.sessions} session(s)`);
  try {
    const svc = execSync('systemctl --user is-active context-compressor.service', { encoding: 'utf8' }).trim();
    console.log(`- Systemd Service: 🟢 ${svc}`);
  } catch (_) {
    console.log(`- Systemd Service: 🔴 inactive`);
  }
}

// ─── Uninstall ───────────────────────────────────────────────────────────────

function uninstall() {
  if (fs.existsSync(OPENCODE_CONFIG)) {
    try {
      const config = JSON.parse(fs.readFileSync(OPENCODE_CONFIG, 'utf8'));
      if (config.mcp && typeof config.mcp === 'object') {
        delete config.mcp['model-memo'];
        if (Object.keys(config.mcp).length === 0) delete config.mcp;
      }
      fs.writeFileSync(OPENCODE_CONFIG, JSON.stringify(config, null, 2));
    } catch (_) {}
  }

  console.log('✅ opencode-context-compressor uninstalled. Durable profile data and the local CA were left in place.');
}

// ─── Main ────────────────────────────────────────────────────────────────────

const arg = (process.argv[2] || 'install').toLowerCase();
if (arg === 'status') status();
else if (arg === 'uninstall') uninstall();
else install();
