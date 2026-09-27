#!/usr/bin/env node
'use strict';

const { spawn, spawnSync } = require('child_process');
const http = require('http');
const net = require('net');
const path = require('path');
const { CA_CERT_PATH, getCA } = require('../src/ca');

const configuredPort = process.env.CONTEXT_COMPRESSOR_PORT;
const DEFAULT_PORT = configuredPort === '0' ? 0 : Number(configuredPort || 3266);
let proxyPort = DEFAULT_PORT;
let proxyUrl = `http://127.0.0.1:${proxyPort}`;
const proxyScript = path.join(__dirname, '..', 'src', 'proxy.js');

function commandExists(command) {
  const probe = spawnSync(command, ['--version'], { stdio: 'ignore', shell: false });
  return !probe.error;
}

function health(port, timeoutMs = 500) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/health`, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try { const data = JSON.parse(body); resolve(res.statusCode === 200 && data.service === 'context-compressor-proxy'); }
        catch (_) { resolve(false); }
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function freePort(start = DEFAULT_PORT) {
  return new Promise((resolve, reject) => {
    if (start === 0) {
      const server = net.createServer(); server.unref(); server.once('error', reject);
      return server.listen(0, '127.0.0.1', () => { const port=server.address().port; server.close(() => resolve(port)); });
    }
    const tryPort = (port) => {
      const server = net.createServer();
      server.unref();
      server.once('error', (err) => err.code === 'EADDRINUSE' && port < start + 20 ? tryPort(port + 1) : reject(err));
      server.listen(port, '127.0.0.1', () => server.close(() => resolve(port)));
    };
    tryPort(start);
  });
}

function waitForProxy(timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const probe = () => {
      health(proxyPort).then((ok) => ok ? resolve() : retry());
    };
    const retry = () => {
      if (Date.now() >= deadline) return reject(new Error('context-compressor proxy did not become healthy'));
      setTimeout(probe, 100);
    };
    probe();
  });
}

async function main() {
  if (!commandExists('opencode')) {
    console.error('opencode-cc: could not find "opencode" in PATH.');
    process.exit(127);
  }

  getCA();

  let proxy = null;
  if (!await health(proxyPort, 300)) {
    proxyPort = await freePort(DEFAULT_PORT);
    proxyUrl = `http://127.0.0.1:${proxyPort}`;
    proxy = spawn(process.execPath, [proxyScript], {
      stdio: ['ignore', 'inherit', 'inherit'],
      windowsHide: true,
      env: { ...process.env, PROXY_PORT: String(proxyPort) },
    });
    proxy.once('exit', (code) => {
      if (code && !process.exitCode) process.exitCode = code;
    });
    await waitForProxy();
  }

  const env = {
    ...process.env,
    HTTP_PROXY: proxyUrl,
    HTTPS_PROXY: proxyUrl,
    http_proxy: proxyUrl,
    https_proxy: proxyUrl,
    NODE_EXTRA_CA_CERTS: CA_CERT_PATH,
  };

  const child = spawn('opencode', process.argv.slice(2), {
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32',
    windowsHide: false,
  });

  const stopProxy = () => {
    if (proxy && !proxy.killed) {
      try { proxy.kill(); } catch (_) {}
    }
  };

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      if (!child.killed) {
        try { child.kill(signal); } catch (_) {}
      }
      stopProxy();
    });
  }

  child.on('error', (error) => {
    console.error('opencode-cc:', error.message);
    stopProxy();
    process.exitCode = 1;
  });

  child.on('exit', (code, signal) => {
    stopProxy();
    if (signal) process.exitCode = 1;
    else process.exitCode = code == null ? 1 : code;
  });
}

main().catch((error) => {
  console.error('opencode-cc:', error.message);
  process.exitCode = 1;
});
