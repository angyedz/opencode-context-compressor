#!/usr/bin/env node
'use strict';

const readline = require('readline');
const memoStore = require('./memo-store');
const profileStore = require('./profile-store');

const SERVER_NAME = 'model-memo';
const SERVER_VERSION = '2.0.0';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

function sendJson(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function ok(id, text) {
  return sendJson({
    jsonrpc: '2.0',
    id,
    result: {
      content: [{ type: 'text', text: String(text) }],
    },
  });
}

function fail(id, message, code = -32603) {
  return sendJson({
    jsonrpc: '2.0',
    id,
    error: { code, message: String(message) },
  });
}

function listTools(id) {
  return sendJson({
    jsonrpc: '2.0',
    id,
    result: {
      tools: [
        {
          name: 'memo_recall',
          description: 'Recall exact details from the currently active conversation only. Use this before asking the user to repeat something that was compacted earlier in the same session.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'recent, first, step #N, 10m, or keywords.' },
              max_chars: { type: 'number', minimum: 200, maximum: 6000 },
            },
          },
        },
        {
          name: 'memo_save',
          description: 'Save a temporary note for the active conversation. This does not become long-term memory.',
          inputSchema: {
            type: 'object',
            properties: {
              note: { type: 'string' },
              category: { type: 'string' },
            },
            required: ['note'],
          },
        },
        {
          name: 'memo_stats',
          description: 'Show temporary active-session memory statistics.',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'profile_remember',
          description: 'Persist one short durable fact that will be useful across future sessions, such as a stable user preference, workflow convention, environment fact, or project decision. Do not store secrets, sensitive personal data, or transient conversation details.',
          inputSchema: {
            type: 'object',
            properties: {
              note: { type: 'string', description: 'One concise durable fact.' },
              category: {
                type: 'string',
                enum: ['preference', 'workflow', 'project', 'communication', 'environment', 'other'],
              },
            },
            required: ['note'],
          },
        },
        {
          name: 'profile_recall',
          description: 'Read durable profile facts saved across sessions.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Optional keyword filter.' },
              max_chars: { type: 'number', minimum: 200, maximum: 4000 },
            },
          },
        },
        {
          name: 'profile_forget',
          description: 'Delete durable profile facts matching a keyword or phrase.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
            required: ['query'],
          },
        },
      ],
    },
  });
}

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let req;
  try {
    req = JSON.parse(trimmed);
  } catch (_) {
    return fail(null, 'Invalid JSON', -32700);
  }

  const { id, method, params } = req;

  if (method === 'initialize') {
    return sendJson({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      },
    });
  }

  if (method === 'notifications/initialized') return;
  if (method === 'tools/list') return listTools(id);

  if (method === 'tools/call') {
    const { name, arguments: args = {} } = params || {};

    try {
      if (name === 'memo_recall') {
        return ok(id, memoStore.recall(null, args.query || 'recent', args.max_chars || 1600));
      }

      if (name === 'memo_save') {
        memoStore.saveExplicit(null, args.note || '', args.category || 'session_note');
        return ok(id, 'Saved a temporary note for the active conversation.');
      }

      if (name === 'memo_stats') {
        const stats = memoStore.stats();
        return ok(
          id,
          `Active-session memory: ${stats.entries} items. Persistent conversation history: disabled.`
        );
      }

      if (name === 'profile_remember') {
        const result = profileStore.remember(args.note || '', args.category || 'other');
        if (!result.saved) return ok(id, 'Nothing was saved.');
        return ok(id, `Remembered durable ${result.fact.category}: ${result.fact.text}`);
      }

      if (name === 'profile_recall') {
        const facts = profileStore.list(args.query || '');
        const cap = Math.min(Math.max(200, Number(args.max_chars) || 1600), 4000);
        if (!facts.length) return ok(id, 'No matching durable profile facts.');
        const text = facts
          .map((fact) => `- [${fact.category}] ${fact.text}`)
          .join('\n')
          .slice(0, cap);
        return ok(id, text);
      }

      if (name === 'profile_forget') {
        const removed = profileStore.forget(args.query || '');
        return ok(id, `Removed ${removed} durable profile fact(s).`);
      }

      return fail(id, `Method or tool not found: ${name}`, -32601);
    } catch (error) {
      return fail(id, error.message || String(error));
    }
  }

  if (id !== undefined) {
    return fail(id, `Unsupported method: ${method}`, -32601);
  }
});
