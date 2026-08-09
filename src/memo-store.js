'use strict';

/**
 * ModelMemo & Persistent Timeline Store.
 * 
 * Hierarchy:
 *  - Step #N: Primary User Request & Assistant Final Response.
 *  - Substep #N.M: Tool Executions (read_file, bash, etc.) under Step #N.
 *  - Timestamps: Absolute HH:MM:SS + relative time (e.g. 5m ago).
 *  - Disk Storage: Persisted to ~/.model-memo/memo.json across OpenCode sessions & restarts.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const MEMO_DIR = process.env.MEMO_DIR || path.join(os.homedir(), '.model-memo');
const MEMO_FILE = process.env.MEMO_FILE || path.join(MEMO_DIR, 'memo.json');
const MAX_STEPS = 50;
const MAX_STORED_TEXT = 25000;
const MAX_RECALL = 3000;
const DEFAULT_RECALL = 1000;

function formatAgo(timestamp) {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  return `${diffHours}h ago`;
}

function formatTime(timestamp) {
  return new Date(timestamp).toISOString().slice(11, 19);
}

class MemoStore {
  constructor() {
    /** @type {Map<string, { currentStep: number, currentSubstep: number, items: Array<any> }>} */
    this._sessions = new Map();
    this._loadFromDisk();
  }

  _loadFromDisk() {
    try {
      if (fs.existsSync(MEMO_FILE)) {
        const raw = JSON.parse(fs.readFileSync(MEMO_FILE, 'utf8'));
        if (raw && typeof raw === 'object') {
          for (const [key, val] of Object.entries(raw)) {
            if (val && Array.isArray(val.items)) {
              this._sessions.set(key, val);
            }
          }
        }
      }
    } catch (_) {
      /* ignore load errors */
    }
  }

  _saveToDisk() {
    try {
      fs.mkdirSync(MEMO_DIR, { recursive: true });
      const obj = {};
      for (const [key, val] of this._sessions.entries()) {
        obj[key] = val;
      }
      fs.writeFileSync(MEMO_FILE, JSON.stringify(obj, null, 2), 'utf8');
    } catch (_) {
      /* ignore save errors */
    }
  }

  _getSession(sessionKey) {
    const key = sessionKey || 'default-session';
    if (!this._sessions.has(key)) {
      this._sessions.set(key, { currentStep: 0, currentSubstep: 0, items: [] });
    }
    return this._sessions.get(key);
  }

  /**
   * Filter out internal command messages from memory
   */
  _filterMessages(rawMessages) {
    if (!Array.isArray(rawMessages)) return [];
    const res = [];
    let skipNextAssistant = false;
    for (const m of rawMessages) {
      if (!m) continue;
      const txt = (typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '')).trim();

      const isCmd = m.role === 'user' && (
        txt.startsWith('$context-compressor') || txt.startsWith('/context-compressor') ||
        txt.startsWith('$compressor') || txt.startsWith('/compressor') ||
        txt.startsWith('$qwen-api') || txt.startsWith('/qwen-api') ||
        txt.startsWith('$model-memo') || txt.startsWith('/model-memo')
      );

      if (isCmd) {
        skipNextAssistant = true;
        continue;
      }

      const isCmdReply = m.role === 'assistant' && (
        skipNextAssistant ||
        txt.includes('⚡') ||
        txt.includes('Context Compressor') ||
        txt.includes('ModelMemo') ||
        txt.includes('Session Reset')
      );

      if (isCmdReply) {
        skipNextAssistant = false;
        continue;
      }

      skipNextAssistant = false;
      res.push(m);
    }
    return res;
  }

  syncMessages(sessionKey, rawMessages) {
    if (!Array.isArray(rawMessages)) return;
    const sess = this._getSession(sessionKey);
    const messages = this._filterMessages(rawMessages);

    let step = 0;
    let substep = 0;
    const newItems = [];

    for (let i = 0; i < messages.length; i += 1) {
      const m = messages[i];
      if (!m || !m.role) continue;

      if (m.role === 'user') {
        const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '');
        if (text.startsWith('<tool_response')) continue;
        step += 1;
        substep = 0;
        newItems.push({
          type: 'step',
          stepIndex: step,
          role: 'user',
          text: text.slice(0, 1500),
          timestamp: m.timestamp || Date.now(),
        });
      } else if (m.role === 'tool') {
        substep += 1;
        const toolName = m.name || m.tool_name || 'tool';
        const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '');
        newItems.push({
          type: 'substep',
          stepIndex: step || 1,
          substepIndex: substep,
          toolName,
          argsSummary: m.argsSummary || '',
          text: text.slice(0, MAX_STORED_TEXT),
          timestamp: m.timestamp || Date.now(),
        });
      } else if (m.role === 'assistant') {
        const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '');
        if (text && !m.tool_calls) {
          newItems.push({
            type: 'step_reply',
            stepIndex: step || 1,
            role: 'assistant',
            text: text.slice(0, 1500),
            timestamp: m.timestamp || Date.now(),
          });
        }
      }
    }

    if (newItems.length > 0) {
      sess.currentStep = step;
      sess.currentSubstep = substep;
      sess.items = newItems.slice(-MAX_STEPS * 5);
      this._saveToDisk();
    }
  }

  saveExplicit(sessionKey, note, category = 'general') {
    const sess = this._getSession(sessionKey);
    sess.currentSubstep += 1;
    sess.items.push({
      type: 'substep',
      stepIndex: Math.max(1, sess.currentStep),
      substepIndex: sess.currentSubstep,
      toolName: `note:${category}`,
      argsSummary: category,
      text: String(note || '').slice(0, MAX_STORED_TEXT),
      timestamp: Date.now(),
    });
    this._saveToDisk();
  }

  recall(sessionKey, query, maxChars) {
    this._loadFromDisk();
    const cap = Math.min(Math.max(100, Number(maxChars) || DEFAULT_RECALL), MAX_RECALL);
    
    let items = [];
    const sess = this._sessions.get(sessionKey);

    if (sess && Array.isArray(sess.items)) {
      items = sess.items;
    }

    if (!items || !items.length) return 'No conversation checkpoints stored in model-memo for this session yet.';

    const q = String(query || '').toLowerCase().trim();
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
      matched = items.slice(0, 10);
    } else if (q === 'recent' || q === 'latest' || q === 'all' || !q) {
      matched = items.slice(-12);
    } else {
      const tokens = q.split(/\s+/).filter((t) => t.length > 1);
      matched = items.filter((item) => {
        const txt = (item.text || '').toLowerCase();
        const tool = (item.toolName || '').toLowerCase();
        const args = (item.argsSummary || '').toLowerCase();
        const combined = `${txt} ${tool} ${args}`;
        return tokens.some((token) => combined.includes(token));
      }).slice(-15);
    }

    if (!matched.length) {
      return `No model-memo checkpoints matching "${query}" found. Total recorded items: ${items.length}.`;
    }

    let output = `# ModelMemo Timeline Checkpoints (Query: "${query}")\n\n`;
    for (const item of matched) {
      const timeStr = `${formatTime(item.timestamp)} (${formatAgo(item.timestamp)})`;
      if (item.type === 'step') {
        output += `[Step #${item.stepIndex} | ${timeStr}] USER: "${item.text.slice(0, 300)}"\n`;
      } else if (item.type === 'step_reply') {
        output += `[Step #${item.stepIndex} | ${timeStr}] ASSISTANT: "${item.text.slice(0, 300)}"\n\n`;
      } else if (item.type === 'substep') {
        const excerpt = item.text.slice(0, 350).replace(/\n+/g, ' ');
        const trunc = item.text.length > 350 ? '…' : '';
        output += `  ↳ [Substep #${item.stepIndex}.${item.substepIndex} | ${timeStr}] TOOL (${item.toolName}) ${item.argsSummary}: ${excerpt}${trunc}\n`;
      }
    }

    return output.slice(0, cap).trim();
  }

  clear(sessionKey) {
    if (sessionKey) this._sessions.delete(sessionKey);
    else this._sessions.clear();
    this._saveToDisk();
  }

  stats() {
    let total = 0;
    this._sessions.forEach((v) => { total += v.items.length; });
    return { sessions: this._sessions.size, entries: total };
  }
}

module.exports = new MemoStore();
