'use strict';

const { spawn, execFileSync } = require('child_process');
const path = require('path');
const memoStore = require('./memo-store');
const profileStore = require('./profile-store');

const disabledSessions = new Set();
const sessionLimits = new Map();

const COMMAND_RE = /^(?:\$|\/)(?:context-compressor|compressor|model-memo|memo|history|search|remember|forget|profile|reset|help)\b/i;

function triggerSelfUpdate() {
  const repoDir = path.resolve(__dirname, '..');
  const script = [
    'set -e',
    `cd "${repoDir.replace(/"/g, '\\"')}"`,
    'git fetch origin master',
    'git merge --ff-only origin/master',
    'npm install --omit=dev',
    'systemctl --user restart context-compressor.service',
  ].join(' && ');

  const child = spawn('/bin/bash', ['-lc', script], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

function checkUpdates() {
  const repoDir = path.resolve(__dirname, '..');
  try {
    execFileSync('git', ['fetch', 'origin', 'master'], { cwd: repoDir, timeout: 10000, stdio: 'ignore' });
    const local = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repoDir, encoding: 'utf8' }).trim();
    const remote = execFileSync('git', ['rev-parse', '--short', 'origin/master'], { cwd: repoDir, encoding: 'utf8' }).trim();
    const behind = execFileSync('git', ['rev-list', '--count', 'HEAD..origin/master'], { cwd: repoDir, encoding: 'utf8' }).trim();

    if (local === remote || behind === '0') {
      return `✅ Context Compressor is up to date (\`${local}\`).`;
    }
    return `🔍 Update available: local \`${local}\`, remote \`${remote}\` (${behind} commit(s) behind). Run \`$compressor update\` to fast-forward.`;
  } catch (error) {
    return `⚠️ Update check failed: ${error.message}`;
  }
}

function lastUserText(messages) {
  if (!Array.isArray(messages)) return '';
  const last = [...messages].reverse().find((message) => message?.role === 'user');
  if (!last) return '';
  if (typeof last.content === 'string') return last.content.trim();
  if (Array.isArray(last.content)) {
    return last.content
      .map((part) => (typeof part === 'string' ? part : part?.text || ''))
      .join('')
      .trim();
  }
  return '';
}

function isCommandMessage(messages) {
  return COMMAND_RE.test(lastUserText(messages));
}

function isCompressorDisabled(sessionKey) {
  return disabledSessions.has(sessionKey);
}

function getSessionLimit(sessionKey) {
  return sessionLimits.get(sessionKey) || 16000;
}

function parseCommand(rawText) {
  const normalized = String(rawText || '').trim().replace(/^[/$]/, '');
  const parts = normalized.split(/\s+/).filter(Boolean);
  const root = (parts[0] || '').toLowerCase();

  if (root === 'compressor' || root === 'context-compressor' || root === 'model-memo') {
    parts.shift();
  }

  const cmd = (parts.shift() || 'help').toLowerCase();
  return { cmd, args: parts };
}

function parseLimit(value) {
  const raw = String(value || '').trim().toLowerCase();
  const match = raw.match(/^(\d+)(k)?$/);
  if (!match) return null;
  const base = Number(match[1]);
  const result = match[2] ? base * 1000 : base;
  return Number.isFinite(result) ? result : null;
}

function executeCommand(messages, sessionKey = 'default') {
  const rawText = lastUserText(messages);
  const { cmd, args } = parseCommand(rawText);

  if (cmd === 'limit' || cmd === 'max' || cmd === 'threshold') {
    const value = parseLimit(args[0]);
    if (value && value >= 2000 && value <= 250000) {
      sessionLimits.set(sessionKey, value);
      return `⚡ Historical context budget set to **${value.toLocaleString()} chars** (~${Math.round(value / 4)} tokens) for this session. The current user turn and provider system prompt are preserved separately.`;
    }
    const current = getSessionLimit(sessionKey);
    return `⚡ Current historical context budget: **${current.toLocaleString()} chars**. Usage: \`$compressor limit 16k\`.`;
  }

  if (['off', 'disable'].includes(cmd)) {
    disabledSessions.add(sessionKey);
    return '⚡ Context compaction is **DISABLED** for this session.';
  }

  if (['on', 'enable'].includes(cmd)) {
    disabledSessions.delete(sessionKey);
    return '⚡ Context compaction is **ENABLED** for this session.';
  }

  if (cmd === 'status') {
    const stats = memoStore.stats();
    const profile = profileStore.stats();
    return [
      '⚡ **Context Compressor Status**',
      '',
      `- Compaction: ${disabledSessions.has(sessionKey) ? '🔴 disabled' : '🟢 enabled'}`,
      `- Historical budget: **${getSessionLimit(sessionKey).toLocaleString()} chars**`,
      `- Active-session memory: **${stats.entries} items** (temporary, non-persistent)`,
      `- Durable profile memory: **${profile.facts} facts**`,
    ].join('\n');
  }

  if (cmd === 'history' || cmd === 'timeline') {
    return memoStore.recall(sessionKey, 'recent', 2400);
  }

  if (cmd === 'search') {
    return memoStore.recall(sessionKey, args.join(' ') || 'recent', 3200);
  }

  if (cmd === 'memo') {
    if (['clear', 'reset'].includes((args[0] || '').toLowerCase())) {
      memoStore.clear(sessionKey);
      return '🧹 Cleared temporary memory for the active session.';
    }
    const stats = memoStore.stats();
    return `🧠 Active-session memory: ${stats.entries} items. It is temporary and is not retained as long-term conversation history.`;
  }

  if (cmd === 'remember') {
    const categories = new Set(['preference', 'workflow', 'project', 'communication', 'environment', 'other']);
    let category = 'preference';
    let textParts = args;
    if (categories.has((args[0] || '').toLowerCase())) {
      category = args[0].toLowerCase();
      textParts = args.slice(1);
    }
    const note = textParts.join(' ').trim();
    if (!note) return 'Usage: `$remember [preference|workflow|project|communication|environment] <fact>`';
    const result = profileStore.remember(note, category);
    return result.saved
      ? `🧠 Remembered durable ${category}: "${result.fact.text}"`
      : 'Nothing was saved.';
  }

  if (cmd === 'forget') {
    const query = args.join(' ').trim();
    if (!query) return 'Usage: `$forget <profile fact or keyword>`';
    const removed = profileStore.forget(query);
    return `🧹 Removed ${removed} durable profile fact(s) matching "${query}".`;
  }

  if (cmd === 'profile') {
    const facts = profileStore.list(args.join(' '));
    if (!facts.length) return '🧠 Durable profile memory is empty.';
    return ['🧠 **Durable profile memory**', '', ...facts.map((fact) => `- [${fact.category}] ${fact.text}`)].join('\n');
  }

  if (cmd === 'reset' || cmd === 'clear') {
    memoStore.clear(sessionKey);
    disabledSessions.delete(sessionKey);
    sessionLimits.delete(sessionKey);
    return '🔄 Reset temporary state for the active session. Durable profile preferences were kept.';
  }

  if (cmd === 'check' || cmd === 'check-update' || cmd === 'checkupdate') {
    return checkUpdates();
  }

  if (cmd === 'update' || cmd === 'upgrade') {
    triggerSelfUpdate();
    return '🚀 Fast-forward self-update started. The service will restart after dependencies are refreshed.';
  }

  return [
    '🛠️ **Context Compressor Commands**',
    '',
    '- `$compressor status` — status and memory sizes',
    '- `$compressor limit 16k` — historical context budget',
    '- `$compressor off` / `on` — toggle compaction',
    '- `$history` — recent active-session timeline',
    '- `$search <query>` — recall exact details from the active session',
    '- `$memo clear` — clear temporary session memory',
    '- `$remember [category] <fact>` — persist a durable preference/project fact',
    '- `$profile` — show durable profile facts',
    '- `$forget <query>` — remove durable profile facts',
    '- `$reset` — reset temporary session state only',
    '- `$compressor check-update` / `update` — update the local service',
  ].join('\n');
}

module.exports = {
  isCommandMessage,
  isCompressorDisabled,
  getSessionLimit,
  executeCommand,
  parseCommand,
  parseLimit,
};
