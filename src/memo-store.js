'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const uid = typeof process.getuid === 'function' ? process.getuid() : 'user';
const SESSION_DIR = process.env.SESSION_DIR || path.join(os.tmpdir(), `opencode-context-compressor-${uid}`);
const SESSION_FILE = process.env.SESSION_FILE || path.join(SESSION_DIR, 'active-session.json');
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 8 * 60 * 60 * 1000);
const MAX_ITEMS = 320;
const MAX_STORED_TEXT = 24000;
const MAX_RECALL = 6000;
const DEFAULT_RECALL = 1600;

function normalizeText(value) {
  return String(value || '').replace(/\u0000/g, '').trim();
}

function extractContentText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === 'string') return part;
      if (!part || typeof part !== 'object') return '';
      if (typeof part.text === 'string') return part.text;
      if (typeof part.content === 'string') return part.content;
      if (part.type === 'tool_use') {
        return `[tool_use ${part.name || 'tool'}] ${JSON.stringify(part.input || {})}`;
      }
      if (part.type === 'tool_result') {
        return `[tool_result ${part.tool_use_id || ''}] ${extractContentText(part.content)}`;
      }
      if (part.functionCall) {
        return `[functionCall ${part.functionCall.name || 'function'}] ${JSON.stringify(part.functionCall.args || {})}`;
      }
      if (part.functionResponse) {
        return `[functionResponse ${part.functionResponse.name || 'function'}] ${JSON.stringify(part.functionResponse.response || {})}`;
      }
      return '';
    }).filter(Boolean).join('\n');
  }
  if (content && typeof content === 'object') {
    if (typeof content.text === 'string') return content.text;
    if (typeof content.content === 'string') return content.content;
  }
  return '';
}

function messageToMemoText(message) {
  let text = extractContentText(message?.content);
  if (Array.isArray(message?.tool_calls) && message.tool_calls.length) {
    const calls = message.tool_calls.map((call) => {
      const fn = call?.function || {};
      return `[tool_call ${fn.name || call?.type || 'tool'} id=${call?.id || ''}] ${fn.arguments || ''}`;
    }).join('\n');
    text = `${text}\n${calls}`.trim();
  }
  if (message?.function_call) {
    text = `${text}\n[function_call ${message.function_call.name || 'function'}] ${message.function_call.arguments || ''}`.trim();
  }
  return normalizeText(text).slice(0, MAX_STORED_TEXT);
}

function isControlCommand(text) {
  return /^(?:\$|\/)(?:context-compressor|compressor|model-memo|memo|history|search|remember|forget|profile|reset|help)\b/i.test(String(text || '').trim());
}

function formatAgo(timestamp) {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  return `${Math.floor(diffMin / 60)}h ago`;
}

function formatTime(timestamp) {
  return new Date(timestamp).toISOString().slice(11, 19);
}

class SessionMemoStore {
  constructor() {
    this._state = null;
    this._load();
  }

  _isExpired(state) {
    return !state || !state.updatedAt || (Date.now() - state.updatedAt) > SESSION_TTL_MS;
  }

  _load() {
    try {
      if (!fs.existsSync(SESSION_FILE)) {
        this._state = null;
        return null;
      }
      const parsed = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
      if (this._isExpired(parsed)) {
        try { fs.unlinkSync(SESSION_FILE); } catch (_) {}
        this._state = null;
        return null;
      }
      this._state = parsed;
      return parsed;
    } catch (_) {
      this._state = null;
      return null;
    }
  }

  _save() {
    if (!this._state) {
      try { fs.unlinkSync(SESSION_FILE); } catch (_) {}
      return;
    }
    fs.mkdirSync(SESSION_DIR, { recursive: true, mode: 0o700 });
    fs.writeFileSync(SESSION_FILE, JSON.stringify(this._state), { encoding: 'utf8', mode: 0o600 });
    try { fs.chmodSync(SESSION_FILE, 0o600); } catch (_) {}
  }

  deriveSessionKey(rawMessages, metadata = {}) {
    if (metadata.sessionId) return `opencode:${String(metadata.sessionId).slice(0, 160)}`;

    const messages = Array.isArray(rawMessages) ? rawMessages : [];
    const firstUser = messages.find((m) => {
      if (m?.role !== 'user') return false;
      const text = messageToMemoText(m);
      return text && !isControlCommand(text);
    });
    if (!firstUser) {
      const active = this.getActiveSessionKey();
      if (active) return active;
    }

    const seed = [
      metadata.provider || '',
      metadata.model || '',
      firstUser ? messageToMemoText(firstUser).slice(0, 4000) : '',
    ].join('\n');

    if (!seed.trim()) return 'default-active-session';

    return `session-${crypto.createHash('sha256').update(seed).digest('hex').slice(0, 20)}`;
  }

  getActiveSessionKey() {
    const state = this._load();
    return state?.key || null;
  }

  _filterMessages(rawMessages) {
    if (!Array.isArray(rawMessages)) return [];
    const result = [];
    let skipNextAssistant = false;

    for (const message of rawMessages) {
      if (!message) continue;
      const text = messageToMemoText(message);
      if (message.role === 'user' && isControlCommand(text)) {
        skipNextAssistant = true;
        continue;
      }
      if (skipNextAssistant && message.role === 'assistant') {
        skipNextAssistant = false;
        continue;
      }
      skipNextAssistant = false;
      result.push(message);
    }
    return result;
  }

  syncMessages(sessionKey, rawMessages) {
    if (!Array.isArray(rawMessages)) return;
    const key = sessionKey || this.deriveSessionKey(rawMessages);
    const previous = this._load();
    const sessionNotes = previous?.key === key
      ? (previous.items || []).filter((item) => item.type === 'note')
      : [];

    const messages = this._filterMessages(rawMessages);
    const items = [];
    let step = 0;
    let substep = 0;

    for (const message of messages) {
      if (!message?.role) continue;
      const text = messageToMemoText(message);
      const timestamp = Number(message.timestamp) || Date.now();

      if (message.role === 'user') {
        step += 1;
        substep = 0;
        items.push({
          type: 'step',
          stepIndex: step,
          role: 'user',
          text: text.slice(0, 5000),
          timestamp,
        });
      } else if (message.role === 'tool') {
        substep += 1;
        items.push({
          type: 'substep',
          stepIndex: Math.max(step, 1),
          substepIndex: substep,
          toolName: message.name || message.tool_name || 'tool',
          text,
          timestamp,
        });
      } else if (message.role === 'assistant') {
        const hasCalls = Array.isArray(message.tool_calls) && message.tool_calls.length > 0;
        if (text || hasCalls) {
          items.push({
            type: hasCalls ? 'assistant_tool' : 'step_reply',
            stepIndex: Math.max(step, 1),
            role: 'assistant',
            text,
            timestamp,
          });
        }
      } else {
        substep += 1;
        items.push({
          type: 'substep',
          stepIndex: Math.max(step, 1),
          substepIndex: substep,
          toolName: message.role,
          text,
          timestamp,
        });
      }
    }

    this._state = {
      version: 2,
      key,
      updatedAt: Date.now(),
      currentStep: step,
      items: [...items, ...sessionNotes].slice(-MAX_ITEMS),
    };
    this._save();
  }

  saveExplicit(sessionKey, note, category = 'session_note') {
    const state = this._load();
    const key = sessionKey || state?.key || 'default-active-session';
    const text = normalizeText(note).slice(0, MAX_STORED_TEXT);
    if (!text) return;

    const base = state?.key === key ? state : {
      version: 2,
      key,
      updatedAt: Date.now(),
      currentStep: 0,
      items: [],
    };

    base.items.push({
      type: 'note',
      stepIndex: Math.max(1, base.currentStep || 1),
      substepIndex: 0,
      toolName: `note:${category}`,
      text,
      timestamp: Date.now(),
    });
    base.items = base.items.slice(-MAX_ITEMS);
    base.updatedAt = Date.now();
    this._state = base;
    this._save();
  }

  recall(sessionKey, query, maxChars) {
    const state = this._load();
    const cap = Math.min(Math.max(200, Number(maxChars) || DEFAULT_RECALL), MAX_RECALL);

    if (!state?.items?.length) {
      return 'No active-session checkpoints are available.';
    }
    if (sessionKey && state.key !== sessionKey) {
      return 'The requested session is not active. Full conversation history is intentionally not retained across sessions.';
    }

    const items = state.items;
    const q = String(query || 'recent').toLowerCase().trim();
    let matched = [];

    const stepMatch = q.match(/step\s*#?(\d+)/i);
    const minAgoMatch = q.match(/(\d+)\s*m(?:in|inutes)?/i);
    const isFirstQuery = /\b(first|start|beginning|первый|первое|начало)\b/i.test(q);

    if (stepMatch) {
      const targetStep = Number(stepMatch[1]);
      matched = items.filter((item) => item.stepIndex === targetStep);
    } else if (minAgoMatch) {
      const mins = Number(minAgoMatch[1]);
      const cutoff = Date.now() - (mins * 60 * 1000 + 30000);
      matched = items.filter((item) => item.timestamp >= cutoff);
    } else if (isFirstQuery) {
      matched = items.slice(0, 12);
    } else if (q === 'recent' || q === 'latest' || q === 'all' || !q) {
      matched = items.slice(-18);
    } else {
      const tokens = q.split(/\s+/).filter((token) => token.length > 1);
      matched = items.filter((item) => {
        const haystack = `${item.text || ''} ${item.toolName || ''}`.toLowerCase();
        return tokens.some((token) => haystack.includes(token));
      }).slice(-24);
    }

    if (!matched.length) {
      return `No active-session checkpoints matching "${query}" found.`;
    }

    let output = `# Active Session Timeline (query: "${query}")\n\n`;
    for (const item of matched) {
      const time = `${formatTime(item.timestamp)} (${formatAgo(item.timestamp)})`;
      if (item.type === 'step') {
        output += `[Step #${item.stepIndex} | ${time}] USER: ${item.text.slice(0, 700)}\n`;
      } else if (item.type === 'step_reply' || item.type === 'assistant_tool') {
        output += `[Step #${item.stepIndex} | ${time}] ASSISTANT: ${item.text.slice(0, 900)}\n`;
      } else {
        output += `  ↳ [Step #${item.stepIndex} | ${time}] ${item.toolName || item.type}: ${item.text.slice(0, 1000)}\n`;
      }
      if (output.length >= cap) break;
    }
    return output.slice(0, cap).trim();
  }

  clear(sessionKey) {
    const state = this._load();
    if (!state) return;
    if (!sessionKey || state.key === sessionKey) {
      this._state = null;
      this._save();
    }
  }

  stats() {
    const state = this._load();
    return {
      sessions: state ? 1 : 0,
      entries: state?.items?.length || 0,
      activeSession: state?.key || null,
      persistent: false,
      file: SESSION_FILE,
    };
  }
}

module.exports = new SessionMemoStore();
module.exports.SESSION_FILE = SESSION_FILE;
module.exports.extractContentText = extractContentText;
module.exports.messageToMemoText = messageToMemoText;
