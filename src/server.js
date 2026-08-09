'use strict';

/**
 * opencode-context-compressor Local Proxy & Interceptor Server (Port 3266)
 * 
 * Intercepts incoming completion requests from OpenCode:
 * 1. If $context-compressor command is sent: The compressor ITSELF answers in 1ms. ZERO LLM calls!
 * 2. If normal request: Syncs memory to model-memo and applies RTK/skeletonizer context compression.
 */

const http = require('http');
const compressor = require('./compressor');
const memoStore = require('./memo-store');
const commands = require('./commands');

const PORT = Number(process.env.PORT || 3266);

function formatStreamChunk(text, id = 'cmd-1') {
  return `data: ${JSON.stringify({
    id: `chatcmpl-${id}`,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: 'context-compressor-local',
    choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: null }],
  })}\n\n`;
}

function formatStreamDone() {
  return 'data: [DONE]\n\n';
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, service: 'opencode-context-compressor', port: PORT }));
  }

  if (req.method === 'POST' && req.url.includes('/chat/completions')) {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      let parsed = {};
      try { parsed = JSON.parse(body); } catch (_) {}

      const messages = parsed.messages || [];
      const sessionKey = req.headers['x-session-id'] || 'default-session';
      const streamRequested = parsed.stream === true;

      // 1. Intercept in-chat $context-compressor commands: COMPRESSOR ITSELF ANSWERS DIRECTLY
      if (commands.isCommandMessage(messages)) {
        const replyText = commands.executeCommand(messages, sessionKey);
        res.writeHead(200, {
          'Content-Type': streamRequested ? 'text/event-stream' : 'application/json',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });

        if (streamRequested) {
          res.write(formatStreamChunk(replyText));
          res.write(formatStreamDone());
          return res.end();
        } else {
          return res.end(JSON.stringify({
            id: 'chatcmpl-cmd-local',
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: 'context-compressor-local',
            choices: [{ index: 0, message: { role: 'assistant', content: replyText }, finish_reason: 'stop' }],
          }));
        }
      }

      // 2. Sync history to persistent model-memo store
      memoStore.syncMessages(sessionKey, messages);

      // 3. Compress context
      const disabled = commands.isCompressorDisabled(sessionKey);
      const compressed = compressor.compressMessages(messages, { disabled });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ...parsed, messages: compressed }));
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`⚡ opencode-context-compressor Server active on http://127.0.0.1:${PORT}`);
});

module.exports = server;
