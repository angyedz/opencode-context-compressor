'use strict';

/**
 * In-Chat $ Command Interceptor & Handler for OpenCode Plugin Injection.
 */

const memoStore = require('./memo-store');
const disabledSessions = new Set();
const sessionLimits = new Map();

function isCommandMessage(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return false;
  const last = [...messages].reverse().find((m) => m?.role === 'user');
  const text = (typeof last?.content === 'string' ? last.content : '').trim();
  return text.startsWith('$context-compressor') || text.startsWith('/context-compressor') || text.startsWith('$compressor') || text.startsWith('/compressor');
}

function isCompressorDisabled(sessionKey) {
  return disabledSessions.has(sessionKey);
}

function getSessionLimit(sessionKey) {
  return sessionLimits.get(sessionKey) || 12000;
}

function executeCommand(messages, sessionKey = 'default') {
  const last = [...messages].reverse().find((m) => m?.role === 'user');
  const rawText = (typeof last?.content === 'string' ? last.content : '').trim();

  const prefixMatch = rawText.match(/^([$/](?:context-compressor|compressor))/i);
  let cleaned = rawText;
  if (prefixMatch) {
    cleaned = rawText.slice(prefixMatch[0].length).trim();
  }
  const parts = cleaned.split(/\s+/);
  const cmd = (parts[0] || '').toLowerCase();
  const arg1 = (parts[1] || '').toLowerCase();
  const arg2 = parts.slice(2).join(' ').trim();

  let responseText = '';

  if (cmd === 'limit' || cmd === 'max' || cmd === 'threshold') {
    const valStr = arg1.replace(/k$/i, '000');
    const val = parseInt(valStr, 10);
    if (!isNaN(val) && val >= 2000 && val <= 250000) {
      sessionLimits.set(sessionKey, val);
      responseText = `⚡ **Context Compressor System**\n\nContext limit set to **${val.toLocaleString()} chars** (~${Math.round(val / 4)} tokens) for session \`${sessionKey}\`.`;
    } else {
      const current = getSessionLimit(sessionKey);
      responseText = `⚡ **Context Compressor Limit**\n\nCurrent limit for \`${sessionKey}\`: **${current.toLocaleString()} chars** (~${Math.round(current / 4)} tokens).\n\nUsage: \`$compressor limit 12000\` or \`$compressor limit 32k\``;
    }
  } else if (cmd === 'compressor' || cmd === 'comp' || cmd === 'off' || cmd === 'on' || cmd === 'status' || cmd === 'disable' || cmd === 'enable') {
    const action = (cmd === 'off' || cmd === 'on' || cmd === 'status' || cmd === 'disable' || cmd === 'enable') ? cmd : arg1;
    if (action === 'off' || action === 'disable' || action === 'false' || action === '0') {
      disabledSessions.add(sessionKey);
      responseText = '⚡ **Context Compressor System**\n\nContext compaction/folding has been **DISABLED** for this session.';
    } else if (action === 'on' || action === 'enable' || action === 'true' || action === '1') {
      disabledSessions.delete(sessionKey);
      responseText = '⚡ **Context Compressor System**\n\nContext compaction/folding is now **ENABLED** for this session.';
    } else {
      const isDisabled = disabledSessions.has(sessionKey);
      const currentLimit = getSessionLimit(sessionKey);
      const stats = memoStore.stats();
      responseText = `⚡ **Context Compressor Status**\n\n` +
        `- **Compaction Mode:** ${isDisabled ? '🔴 Disabled' : '🟢 Enabled'}\n` +
        `- **Context Limit:** **${currentLimit.toLocaleString()} chars** (~${Math.round(currentLimit / 4)} tokens)\n` +
        `- **Active Session ID:** \`${sessionKey}\`\n` +
        `- **Stored Memory Items:** ${stats.entries} across ${stats.sessions} session(s)`;
    }
  } else if (cmd === 'memo') {
    if (arg1 === 'clear' || arg1 === 'reset') {
      memoStore.clear(sessionKey);
      responseText = `🧹 Cleared \`model-memo\` checkpoints for the current session.`;
    } else {
      const stats = memoStore.stats();
      responseText = `🧠 **ModelMemo Memory Stats**\n\n` +
        `- **Global Persisted Items:** ${stats.entries} items across ${stats.sessions} session(s)\n` +
        `- **Disk Storage:** \`~/.model-memo/memo.json\`\n\n` +
        `*Use \`$memo clear\` to reset session memory.*`;
    }
  } else if (cmd === 'history' || cmd === 'timeline') {
    responseText = memoStore.recall(sessionKey, 'recent', 1500);
  } else if (cmd === 'search') {
    const query = arg1 ? `${arg1} ${arg2}`.trim() : 'recent';
    responseText = memoStore.recall(sessionKey, query, 2000);
  } else if (cmd === 'reset' || cmd === 'clear') {
    memoStore.clear(sessionKey);
    responseText = `🔄 **Session Reset Complete**\n\nCleared local checkpoint history for session \`${sessionKey}\`.`;
  } else {
    const currentLimit = getSessionLimit(sessionKey);
    responseText = `🛠️ **ModelMemo Injection Commands**\n\n` +
      `- \`$compressor limit <N>\` — Set context limit (e.g. \`12k\`, \`32k\`, \`55000\`). Current: ${currentLimit} chars.\n` +
      `- \`$compressor off\` / \`on\` — Disable or enable context compaction for this session.\n` +
      `- \`$compressor status\` — View compressor and session status.\n` +
      `- \`$history\` — Show turn breakdown timeline for current session.\n` +
      `- \`$search <query>\` — Search model-memo memory checkpoints.\n` +
      `- \`$memo\` — View model-memo memory statistics.\n` +
      `- \`$memo clear\` — Clear memory checkpoints for current session.\n` +
      `- \`$reset\` — Reset session checkpoints.\n` +
      `- \`$help\` — Show this help message.`;
  }

  return responseText;
}

module.exports = {
  isCommandMessage,
  isCompressorDisabled,
  getSessionLimit,
  executeCommand,
};
