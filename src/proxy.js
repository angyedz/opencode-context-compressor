'use strict';

/**
 * opencode-context-compressor MITM Transparent Proxy
 *
 * Intercepts ALL HTTP and HTTPS requests from OpenCode:
 *   - $context-compressor commands → answered instantly by the compressor itself (0 LLM calls)
 *   - Normal requests → context compressed → forwarded to real provider with original headers/auth/URL
 *
 * Supports: OpenAI, Anthropic, Gemini formats + streaming (SSE)
 *
 * Usage:
 *   HTTP_PROXY=http://127.0.0.1:3266 HTTPS_PROXY=http://127.0.0.1:3266 opencode
 */

const http = require('http');
const https = require('https');
const net = require('net');
const tls = require('tls');
const url = require('url');

const formats = require('./formats');
const compressor = require('./compressor');
const commands = require('./commands');
const memoStore = require('./memo-store');
const { getDomainCert, getCA, CA_CERT_PATH } = require('./ca');

const PORT = Number(process.env.PROXY_PORT || 3266);

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 64, timeout: 60000 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 64, timeout: 60000, rejectUnauthorized: false });

// ─── qwen-free-api fingerprint detection ────────────────────────────────────
// Cache: 'host:port' → true (is qwen-free-api) | false
const qwenFreeApiCache = new Map();

/**
 * Fast 300ms probe for local qwen-free-api via GET /healthz header X-Service.
 * Result is cached per host:port forever.
 */
async function isQwenFreeApi(hostname, port) {
  const p = port || 80;
  const key = `${hostname}:${p}`;
  if (qwenFreeApiCache.has(key)) return qwenFreeApiCache.get(key);

  return new Promise((resolve) => {
    const req = http.request(
      { hostname, port: p, path: '/healthz', method: 'GET', timeout: 300 },
      (res) => {
        const serviceHeader = (res.headers['x-service'] || '').toLowerCase();
        const isQwen = serviceHeader === 'qwen-free-api';
        qwenFreeApiCache.set(key, isQwen);
        res.resume();
        if (isQwen) console.log(`[proxy] fingerprinted qwen-free-api at ${key} — skipping compression`);
        resolve(isQwen);
      }
    );
    req.on('error', () => { qwenFreeApiCache.set(key, false); resolve(false); });
    req.on('timeout', () => { req.destroy(); qwenFreeApiCache.set(key, false); resolve(false); });
    req.end();
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => resolve(Buffer.alloc(0)));
  });
}

function isAiPath(pathname) {
  return (
    pathname.includes('/chat/completions') ||
    pathname.includes('/v1/messages') ||
    pathname.includes('/v1beta/messages') ||
    pathname.includes('generateContent') ||
    pathname.includes('streamGenerateContent')
  );
}

// ─── Core interceptor ───────────────────────────────────────────────────────

async function handleAiRequest(req, res, targetUrl, body) {
  let parsed = {};
  try { parsed = JSON.parse(body); } catch (_) {}

  const pathname = targetUrl.pathname || req.url || '';
  const format = formats.detectFormat(pathname, parsed);

  if (!format) {
    // Unknown format — forward as-is
    return forwardRequest(req, res, body, targetUrl);
  }

  const lastUserText = formats.getLastUserText(parsed, format);
  const sessionKey = targetUrl.hostname || req.headers.host || 'default';

  // ── 1. Command interception: ALWAYS answered by compressor directly (0 LLM calls) ──
  if (commands.isCommandMessage([{ role: 'user', content: lastUserText }])) {
    const replyText = commands.executeCommand(
      [{ role: 'user', content: lastUserText }],
      sessionKey
    );
    const isStream = Boolean(parsed.stream);

    if (isStream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Intercepted-By': 'context-compressor',
      });
      const chunks = formats.buildCommandResponse(replyText, format, true);
      for (const chunk of chunks) res.write(chunk);
    } else {
      const responseObj = formats.buildCommandResponse(replyText, format, false);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Intercepted-By': 'context-compressor',
      });
      res.write(JSON.stringify(responseObj));
    }
    return res.end();
  }

  // ── 2. Check if upstream is qwen-free-api ──────────────────────────────
  const isLocal = targetUrl.hostname === '127.0.0.1' || targetUrl.hostname === 'localhost';
  if (isLocal && await isQwenFreeApi(targetUrl.hostname, targetUrl.port || 80)) {
    // qwen-free-api handles history compression internally — forward as-is
    return forwardRequest(req, res, body, targetUrl);
  }

  // ── 3. Normal request to external LLM: compress context → forward ──────
  memoStore.syncMessages(sessionKey, formats.extractMessages(parsed, format));
  const disabled = commands.isCompressorDisabled(sessionKey);
  const maxChars = commands.getSessionLimit(sessionKey);
  const msgs = formats.extractMessages(parsed, format);
  const compressed = compressor.compressMessages(msgs, { disabled, maxChars });
  const newBody = Buffer.from(JSON.stringify(formats.rebuildBody(parsed, compressed, format)));

  return forwardRequest(req, res, newBody, targetUrl);
}

// ─── HTTP forwarding ────────────────────────────────────────────────────────

function forwardRequest(req, res, body, targetUrl) {
  const isHttps = targetUrl.protocol === 'https:';
  const lib = isHttps ? https : http;
  const port = targetUrl.port || (isHttps ? 443 : 80);
  const bodyBuf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8');

  // Strip hop-by-hop headers that can't be forwarded
  const forwardHeaders = { ...req.headers };
  delete forwardHeaders['proxy-connection'];
  delete forwardHeaders['proxy-authorization'];
  delete forwardHeaders['te'];
  delete forwardHeaders['trailers'];
  delete forwardHeaders['upgrade'];

  const options = {
    hostname: targetUrl.hostname,
    port,
    path: targetUrl.pathname + (targetUrl.search || ''),
    method: req.method,
    headers: {
      ...forwardHeaders,
      host: targetUrl.host,
      'content-length': bodyBuf.length,
    },
    agent: isHttps ? httpsAgent : httpAgent,
    rejectUnauthorized: false,
  };

  const proxyReq = lib.request(options, (proxyRes) => {
    if (res.socket) res.socket.setNoDelay(true);
    if (proxyRes.socket) proxyRes.socket.setNoDelay(true);

    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    proxyRes.on('data', (chunk) => {
      res.write(chunk);
    });

    proxyRes.on('end', () => {
      res.end();
    });

    proxyRes.on('error', () => {
      if (!res.writableEnded) res.end();
    });
  });

  proxyReq.setNoDelay(true);

  // If client cancels generation, abort request to upstream provider immediately
  req.on('close', () => {
    if (!proxyReq.destroyed) {
      proxyReq.destroy();
    }
  });

  proxyReq.on('error', (err) => {
    if (err.code === 'ECONNRESET' || err.code === 'ECANCELED') return;
    console.error('[proxy] forward error:', err.message);
    if (!res.headersSent) {
      res.writeHead(502);
      res.end('Bad Gateway');
    }
  });

  proxyReq.write(bodyBuf);
  proxyReq.end();
}

// ─── HTTP Proxy Server ───────────────────────────────────────────────────────

const proxyServer = http.createServer(async (req, res) => {
  // Health check
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, service: 'context-compressor-proxy', port: PORT, ca: CA_CERT_PATH }));
  }

  const body = await readBody(req);
  const targetUrl = url.parse(req.url.startsWith('http') ? req.url : `http://${req.headers.host}${req.url}`);

  if (req.method === 'POST' && isAiPath(targetUrl.pathname || req.url)) {
    return handleAiRequest(req, res, targetUrl, body);
  }

  // Non-AI request → transparent forward
  return forwardRequest(req, res, body, targetUrl);
});

// ─── HTTPS CONNECT MITM ──────────────────────────────────────────────────────

proxyServer.on('connect', (req, clientSocket, head) => {
  const [hostname, portStr] = (req.url || '').split(':');
  const port = parseInt(portStr) || 443;

  // Pre-generate cert (may be slow first time per domain)
  let domainCert;
  try {
    domainCert = getDomainCert(hostname);
  } catch (err) {
    clientSocket.write('HTTP/1.1 502 CA Error\r\n\r\n');
    return clientSocket.destroy();
  }

  // Create MITM TLS server for this connection
  const mitmServer = tls.createServer(
    { cert: domainCert.cert, key: domainCert.key },
    (mitmSocket) => {
      // Parse HTTP requests coming over the decrypted TLS socket
      const innerHttp = http.createServer(async (innerReq, innerRes) => {
        const body = await readBody(innerReq);
        const pathname = innerReq.url || '/';
        const targetUrl = {
          protocol: 'https:',
          hostname,
          host: `${hostname}:${port}`,
          port,
          pathname,
          search: '',
        };

        if (innerReq.method === 'POST' && isAiPath(pathname)) {
          return handleAiRequest(innerReq, innerRes, targetUrl, body);
        }
        return forwardRequest(innerReq, innerRes, body, targetUrl);
      });

      innerHttp.emit('connection', mitmSocket);
    }
  );

  mitmServer.listen(0, '127.0.0.1', () => {
    const mitmPort = mitmServer.address().port;

    // Tell client we're connected
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');

    // Connect client to our MITM TLS server
    const mitmSocket = net.connect(mitmPort, '127.0.0.1', () => {
      if (head && head.length) mitmSocket.write(head);
      mitmSocket.pipe(clientSocket);
      clientSocket.pipe(mitmSocket);
    });

    mitmSocket.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => mitmSocket.destroy());
    mitmServer.on('error', () => clientSocket.destroy());
  });
});

proxyServer.on('error', (err) => console.error('[proxy] server error:', err.message));

proxyServer.listen(PORT, '0.0.0.0', () => {
  const ca = getCA(); // ensure CA exists
  console.log(`⚡ context-compressor MITM Proxy running on http://127.0.0.1:${PORT}`);
  console.log(`🔐 Root CA certificate: ${CA_CERT_PATH}`);
  console.log(`   Install CA to trust HTTPS interception (see: node bin/cli.js install)`);
});

module.exports = proxyServer;
