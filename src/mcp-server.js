#!/usr/bin/env node
'use strict';

/**
 * model-memo MCP Server — stdio JSON-RPC server for OpenCode
 * 
 * Server Name: model-memo
 * Tools:
 *   - memo_recall: Search timeline memory checkpoints across steps, substeps, timestamps, and keywords.
 *   - memo_save: Explicitly checkpoint important user/architectural facts.
 *   - memo_stats: View persistent store analytics.
 */

const readline = require('readline');
const memoStore = require('./memo-store');

const SERVER_NAME = 'model-memo';
const SERVER_VERSION = '1.0.0';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

function sendJson(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let req;
  try {
    req = JSON.parse(trimmed);
  } catch (_) {
    return;
  }

  const { id, method, params } = req;

  if (method === 'initialize') {
    return sendJson({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: SERVER_NAME,
          version: SERVER_VERSION,
        },
      },
    });
  }

  if (method === 'notifications/initialized') {
    return;
  }

  if (method === 'tools/list') {
    return sendJson({
      jsonrpc: '2.0',
      id,
      result: {
        tools: [
          {
            name: 'memo_recall',
            description: 'Recall conversation history checkpoints from model-memo persistent timeline memory. Call this BEFORE asking the user to clarify past events, earlier steps (e.g. Step #1), or what was done earlier in the session.',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Query string: "recent" (latest events), "first" (beginning of conversation), "step #N" (specific step), "10m" (events from last 10 mins), or keyword tokens.',
                },
                max_chars: {
                  type: 'number',
                  description: 'Maximum response length in characters (default 1000, max 3000).',
                },
              },
            },
          },
          {
            name: 'memo_save',
            description: 'Explicitly save a key project fact, architectural decision, or user instruction to model-memo persistent disk memory.',
            inputSchema: {
              type: 'object',
              properties: {
                note: {
                  type: 'string',
                  description: 'The key fact or decision to persist.',
                },
                category: {
                  type: 'string',
                  description: 'Optional category tag (e.g. "architecture", "user_pref", "bug_fix").',
                },
              },
              required: ['note'],
            },
          },
          {
            name: 'memo_stats',
            description: 'View persistent model-memo storage statistics.',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
        ],
      },
    });
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params || {};
    const sessionKey = (args && args.session_id) || 'default-opencode-session';

    if (name === 'memo_recall') {
      const query = (args && args.query) || 'recent';
      const maxChars = (args && args.max_chars) || 1000;
      const result = memoStore.recall(sessionKey, query, maxChars);
      return sendJson({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: result }],
        },
      });
    }

    if (name === 'memo_save') {
      const note = (args && args.note) || '';
      const category = (args && args.category) || 'user_note';
      memoStore.saveExplicit(sessionKey, note, category);
      return sendJson({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: `✅ Saved note to model-memo [Category: ${category}]: "${note.slice(0, 100)}"` }],
        },
      });
    }

    if (name === 'memo_stats') {
      const stats = memoStore.stats();
      return sendJson({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: `🧠 model-memo stats: ${stats.entries} items across ${stats.sessions} session(s). Disk: ~/.model-memo/memo.json` }],
        },
      });
    }

    return sendJson({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method or tool not found: ${name}` },
    });
  }

  if (id) {
    return sendJson({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Unsupported method: ${method}` },
    });
  }
});
