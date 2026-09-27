'use strict';

const { execFileSync } = require('child_process');
const path = require('path');
const memoStore = require('./memo-store');
const profileStore = require('./profile-store');
const diagnostics = require('./context/diagnostics');
const runtimeMetrics = require('./context/runtime-metrics');
const compressor = require('./compressor');
const selectionExplain = require('./context/selection-explain');

const disabledSessions = new Set();
const sessionLimits = new Map();
const sessionTokenLimits = new Map();
const sessionInputLimits = new Map();
const sessionOutputReserves = new Map();

const COMMAND_RE = /^(?:\$|\/)(?:context-compressor|compressor|model-memo|memo|history|search|remember|forget|profile|reset|help)\b/i;

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

function getSessionTokenLimit(sessionKey) {
  return sessionTokenLimits.get(sessionKey) || null;
}

function getSessionInputLimit(sessionKey) {
  return sessionInputLimits.get(sessionKey) || null;
}

function getSessionOutputReserve(sessionKey) {
  return sessionOutputReserves.get(sessionKey) || 4096;
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

  if (cmd === 'tokens' || cmd === 'token-limit') {
    const value = parseLimit(args[0]);
    if (value && value >= 256 && value <= 500000) {
      sessionTokenLimits.set(sessionKey, value);
      return `⚡ Historical token budget set to **${value.toLocaleString()} estimated tokens** for this session.`;
    }
    const current = getSessionTokenLimit(sessionKey);
    return `⚡ Historical token budget: **${current ? current.toLocaleString() : 'auto'}**. Usage: \`$compressor tokens 8k\`.`;
  }

  if (cmd === 'window' || cmd === 'input-window' || cmd === 'input') {
    const value = parseLimit(args[0]);
    if (value && value >= 1000 && value <= 2000000) {
      sessionInputLimits.set(sessionKey, value);
      return `⚡ Total input window set to **${value.toLocaleString()} tokens** for this session.`;
    }
    const current = getSessionInputLimit(sessionKey);
    return `⚡ Total input window: **${current ? current.toLocaleString() : 'provider/default'}**. Usage: \`$compressor window 64k\`.`;
  }

  if (cmd === 'reserve' || cmd === 'output-reserve') {
    const value = parseLimit(args[0]);
    if (value && value >= 256 && value <= 500000) {
      sessionOutputReserves.set(sessionKey, value);
      return `⚡ Output reserve set to **${value.toLocaleString()} tokens** for this session.`;
    }
    return `⚡ Output reserve: **${getSessionOutputReserve(sessionKey).toLocaleString()} tokens**. Usage: \`$compressor reserve 8k\`.`;
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
    const last = runtimeMetrics.get(sessionKey);
    return [
      '⚡ **Context Compressor Status**',
      '',
      `- Compaction: ${disabledSessions.has(sessionKey) ? '🔴 disabled' : '🟢 enabled'}`,
      `- Historical budget: **${getSessionLimit(sessionKey).toLocaleString()} chars** / **${getSessionTokenLimit(sessionKey)?.toLocaleString() || 'auto'} est. tokens**`,
      `- Input window / output reserve: **${getSessionInputLimit(sessionKey)?.toLocaleString() || 'provider/default'} / ${getSessionOutputReserve(sessionKey).toLocaleString()} tokens**`,
      `- Active-session memory: **${stats.entries} items across ${stats.sessions} session(s)** (temporary, non-persistent)`,
      `- Durable profile memory: **${profile.facts} facts**`,
      ...(last ? [
        `- Last compression: **${last.before.tokens.toLocaleString()} → ${last.after.tokens.toLocaleString()} est. tokens** (${last.savings.tokenPercent.toFixed(1)}% saved, ${last.savings.ratio.toFixed(2)}× smaller)`,
        `- Last quality score: **${last.quality.score}/100**; protocol=${last.quality.protocolValid ? 'valid' : 'INVALID'}`,
      ] : []),
    ].join('\n');
  }

  if (cmd === 'explain' || cmd === 'diagnostics' || cmd === 'debug-context') {
    const base = diagnostics.render(diagnostics.inspect(messages));
    const turns = diagnostics.splitTurns((messages || []).filter((message) => message?.role !== 'system'));
    const activeText = diagnostics.recentUser(messages);
    const ranked = compressor.collectRankedAnchorRecords(turns.slice(0, -1), activeText, 6);
    const selection = selectionExplain.renderSelection(ranked, { limit: 6 });
    const last = runtimeMetrics.get(sessionKey);
    return [
      base,
      '',
      selection,
      ...(last ? [
        '',
        '📉 **Last compression report**',
        `- Estimated tokens: ${last.before.tokens.toLocaleString()} → ${last.after.tokens.toLocaleString()} (${last.savings.tokenPercent.toFixed(1)}% saved)`,
        `- Serialized chars: ${last.before.chars.toLocaleString()} → ${last.after.chars.toLocaleString()} (${last.savings.charPercent.toFixed(1)}% saved)`,
        `- Quality: ${last.quality.score}/100; protocol=${last.quality.protocolValid ? 'valid' : 'INVALID'}`,
        `- Output graph: ${last.graph.nodes} nodes / ${last.graph.edges} edges`,
      ] : []),
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
    sessionTokenLimits.delete(sessionKey);
    sessionInputLimits.delete(sessionKey);
    sessionOutputReserves.delete(sessionKey);
    return '🔄 Reset temporary state for the active session. Durable profile preferences were kept.';
  }

  if (cmd === 'check' || cmd === 'check-update' || cmd === 'checkupdate') {
    return checkUpdates();
  }

  if (cmd === 'update' || cmd === 'upgrade') {
    return 'Update with your package manager (for example `npm update -g opencode-context-compressor`) and start `opencode-cc` again. No background service restart is required.';
  }

  return [
    '🛠️ **Context Compressor Commands**',
    '',
    '- `$compressor status` — status and memory sizes',
    '- `$compressor limit 16k` — historical character budget',
    '- `$compressor tokens 8k` — historical estimated-token budget',
    '- `$compressor window 64k` — total input token window',
    '- `$compressor reserve 8k` — reserve tokens for model output',
    '- `$compressor off` / `on` — toggle compaction',
    '- `$compressor explain` — explain current context size, graph and state without dumping message contents',
    '- `$history` — recent active-session timeline',
    '- `$search <query>` — recall exact details from the active session',
    '- `$memo clear` — clear temporary session memory',
    '- `$remember [category] <fact>` — persist a durable preference/project fact',
    '- `$profile` — show durable profile facts',
    '- `$forget <query>` — remove durable profile facts',
    '- `$reset` — reset temporary session state only',
    '- `$compressor check-update` — compare this checkout with origin/master',
    '- `$compressor update` — show the safe package-manager update command',
  ].join('\n');
}

module.exports = {
  isCommandMessage,
  isCompressorDisabled,
  getSessionLimit,
  getSessionTokenLimit,
  getSessionInputLimit,
  getSessionOutputReserve,
  executeCommand,
  parseCommand,
  parseLimit,
};
