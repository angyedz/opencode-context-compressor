#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HOME = os.homedir();
const CONFIG_HOME = process.env.XDG_CONFIG_HOME || path.join(HOME, '.config');
const PROJECT_DIR = path.resolve(__dirname, '..');
const MCP_SERVER_SCRIPT = path.join(PROJECT_DIR, 'src', 'mcp-server.js');
const NODE_BIN = process.execPath;
const OPENCODE_CONFIG = process.env.OPENCODE_CONFIG || path.join(CONFIG_HOME, 'opencode', 'opencode.json');
const CA_CERT_PATH = path.join(HOME, '.context-compressor', 'ca', 'ca.crt');

function installCA() {
  if (!fs.existsSync(CA_CERT_PATH)) {
    const result = spawnSync(NODE_BIN, ['-e', `require(${JSON.stringify(path.join(PROJECT_DIR, 'src', 'ca.js'))}).getCA()`], {
      stdio: 'inherit',
      timeout: 30000,
    });
    if (result.status !== 0 || !fs.existsSync(CA_CERT_PATH)) throw new Error('local CA generation failed');
  }
  console.log(`Local CA: ${CA_CERT_PATH}`);
  console.log('System trust store was NOT modified.');
}

function readConfig() {
  if (!fs.existsSync(OPENCODE_CONFIG)) return {};
  try { return JSON.parse(fs.readFileSync(OPENCODE_CONFIG, 'utf8')); }
  catch (error) { throw new Error(`OpenCode config is not valid JSON: ${OPENCODE_CONFIG}: ${error.message}`); }
}

function writeConfig(config) {
  fs.mkdirSync(path.dirname(OPENCODE_CONFIG), { recursive: true });
  const tmp = OPENCODE_CONFIG + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, OPENCODE_CONFIG);
}

function installMCP() {
  const config = readConfig();
  if (!config.mcp || typeof config.mcp !== 'object' || Array.isArray(config.mcp)) config.mcp = {};
  config.mcp['model-memo'] = { type: 'local', command: [NODE_BIN, MCP_SERVER_SCRIPT], enabled: true };
  if (Array.isArray(config.plugin)) {
    config.plugin = config.plugin.filter((entry) => !String(entry).includes('context-compressor'));
    if (!config.plugin.length) delete config.plugin;
  }
  writeConfig(config);
  console.log(`Registered model-memo MCP in ${OPENCODE_CONFIG}`);
}

function uninstall() {
  const config = readConfig();
  if (config.mcp && typeof config.mcp === 'object') {
    delete config.mcp['model-memo'];
    if (!Object.keys(config.mcp).length) delete config.mcp;
    writeConfig(config);
  }
  console.log('Removed model-memo MCP registration. Local CA and durable profile were left untouched.');
}

function status() {
  const memo = require('../src/memo-store').stats();
  console.log('opencode-context-compressor');
  console.log(`- launcher: opencode-cc`);
  console.log(`- proxy: starts on demand at http://127.0.0.1:3266`);
  console.log(`- local CA: ${fs.existsSync(CA_CERT_PATH) ? 'ready' : 'not generated yet'}`);
  console.log(`- temporary sessions: ${memo.sessions}; checkpoints: ${memo.entries}`);
}

function install() {
  installMCP();
  installCA();
  console.log('\nReady. Start OpenCode with:\n  opencode-cc\n');
  console.log('The launcher starts the local proxy on demand and stops the proxy it owns when OpenCode exits.');
}

const command = String(process.argv[2] || 'install').toLowerCase();
try {
  if (command === 'uninstall') uninstall();
  else if (command === 'status') status();
  else if (command === 'install') install();
  else {
    console.error('Usage: context-compressor [install|status|uninstall]');
    process.exitCode = 2;
  }
} catch (error) {
  console.error('context-compressor:', error.message);
  process.exitCode = 1;
}
