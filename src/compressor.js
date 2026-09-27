'use strict';

const profileStore = require('./profile-store');

const MAX_HISTORY_CHARS = 16000;
const COMPACT_TRIGGER_CHARS = 14000;
const MIN_HISTORY_CHARS = 2000;

function isControlCommand(text) {
  return /^(?:\$|\/)(?:context-compressor|compressor|model-memo|memo|history|search|remember|forget|profile|reset|help)\b/i.test(String(text || '').trim());
}

function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => extractText(part)).filter(Boolean).join('\n');
  }
  if (content && typeof content === 'object') {
    if (typeof content.text === 'string') return content.text;
    if (content.content !== undefined) return extractText(content.content);
  }
  return '';
}

function replaceTextContent(content, nextText) {
  if (typeof content === 'string') return nextText;

  if (Array.isArray(content)) {
    let replaced = false;
    const mapped = content.map((part) => {
      if (typeof part === 'string') {
        if (replaced) return '';
        replaced = true;
        return nextText;
      }
      if (!part || typeof part !== 'object') return part;
      if (typeof part.text === 'string') {
        if (replaced) return { ...part, text: '' };
        replaced = true;
        return { ...part, text: nextText };
      }
      if (typeof part.content === 'string') {
        if (replaced) return { ...part, content: '' };
        replaced = true;
        return { ...part, content: nextText };
      }
      return part;
    });

    return replaced ? mapped : content;
  }

  if (content && typeof content === 'object') {
    if (typeof content.text === 'string') return { ...content, text: nextText };
    if (typeof content.content === 'string') return { ...content, content: nextText };
  }

  return content;
}

function messageSize(message) {
  try { return JSON.stringify(message).length; } catch (_) { return extractText(message?.content).length; }
}

function messagesSize(messages) {
  return (messages || []).reduce((total, message) => total + messageSize(message), 0);
}

function compressTerminalOutput(text, targetChars = 2200) {
  if (typeof text !== 'string' || text.length < 500) return text;

  if (text.includes('diff --git') || text.includes('--- a/') || text.includes('+++ b/')) {
    const lines = text.split('\n');
    const kept = [];
    let unchanged = 0;

    for (const line of lines) {
      const important = (
        line.startsWith('diff --git') ||
        line.startsWith('--- ') ||
        line.startsWith('+++ ') ||
        line.startsWith('@@') ||
        line.startsWith('+') ||
        line.startsWith('-')
      );
      if (important) {
        kept.push(line);
        unchanged = 0;
      } else if (unchanged < 2) {
        kept.push(line);
        unchanged += 1;
      } else if (unchanged === 2) {
        kept.push('  ... [unchanged lines omitted] ...');
        unchanged += 1;
      }
    }

    const diff = kept.join('\n');
    if (diff.length < text.length) text = diff;
  }

  if (
    (text.includes('npm ERR!') || text.includes('FAIL') || text.includes('Traceback (most recent call last)')) &&
    text.split('\n').length > 50
  ) {
    const lines = text.split('\n');
    text = [
      ...lines.slice(0, 18),
      `... [${Math.max(0, lines.length - 48)} intermediate log lines omitted] ...`,
      ...lines.slice(-30),
    ].join('\n');
  }

  const cap = Math.max(700, Number(targetChars) || 2200);
  if (text.length > cap) {
    const headSize = Math.floor(cap * 0.45);
    const tailSize = Math.floor(cap * 0.45);
    const omitted = text.length - headSize - tailSize;
    return `${text.slice(0, headSize)}\n... [${omitted} chars omitted; use memo_recall if needed] ...\n${text.slice(-tailSize)}`;
  }

  return text;
}

function skeletonizeCode(text, targetChars = 2200) {
  if (typeof text !== 'string' || text.length < 1500) return text;
  if (!/(?:\bfunction\b|\bclass\b|\bdef\s+|=>)/.test(text)) {
    return compressTerminalOutput(text, targetChars);
  }

  const lines = text.split('\n');
  if (lines.length < 45) return compressTerminalOutput(text, targetChars);

  const structural = [];
  for (const line of lines.slice(10, -8)) {
    if (/^\s*(?:export\s+)?(?:async\s+)?function\s+\w+/.test(line) ||
        /^\s*(?:export\s+)?class\s+\w+/.test(line) ||
        /^\s*def\s+\w+/.test(line) ||
        /^\s*(?:const|let|var)\s+\w+\s*=.*=>/.test(line)) {
      structural.push(line.trimEnd());
    }
    if (structural.length >= 24) break;
  }

  const result = [
    ...lines.slice(0, 10),
    `... [${Math.max(0, lines.length - 18)} implementation lines compacted] ...`,
    ...structural,
    ...lines.slice(-8),
  ].join('\n');

  return compressTerminalOutput(result, targetChars);
}

function trimSemanticNoise(text) {
  if (typeof text !== 'string' || text.length < 80) return text;
  return text
    .replace(/^Sure,? I can help with that\.?\s*/i, '')
    .replace(/^Certainly!? Here is what I found:\s*/i, '')
    .replace(/^As an AI coding assistant,?\s*/i, '')
    .replace(/^I understand your request\.?\s*/i, '');
}

function stripCommands(messages) {
  if (!Array.isArray(messages)) return [];
  const result = [];
  let skipNextAssistant = false;

  for (const message of messages) {
    if (!message) continue;
    const text = extractText(message.content).trim();

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

function isToolResponseUser(message) {
  if (message?.role !== 'user' || !Array.isArray(message.content)) return false;
  return message.content.some((part) => {
    return part?.type === 'tool_result' || Boolean(part?.functionResponse);
  });
}

function splitTurns(messages) {
  const turns = [];
  let current = [];

  for (const message of messages || []) {
    const startsNewTurn = message?.role === 'user' && !isToolResponseUser(message);
    if (startsNewTurn && current.length) {
      turns.push(current);
      current = [message];
    } else {
      current.push(message);
    }
  }

  if (current.length) turns.push(current);
  return turns;
}

function hasStructuredContent(message) {
  return Array.isArray(message?.content) && message.content.some((part) => {
    if (!part || typeof part !== 'object') return false;
    if (part.type && part.type !== 'text') return true;
    return Boolean(part.functionCall || part.functionResponse || part.inlineData || part.fileData);
  });
}

function transformMessage(message, age) {
  if (hasStructuredContent(message)) return message;
  const text = extractText(message?.content);
  if (!text) return message;

  let next = text;
  if (message.role === 'tool') {
    next = compressTerminalOutput(text, age === 'cold' ? 1600 : 2400);
  } else if (message.role === 'assistant') {
    next = trimSemanticNoise(text);
    if (age === 'cold' && !message.tool_calls && !message.function_call) {
      next = skeletonizeCode(next, 2200);
    }
  } else if (message.role === 'user' && age === 'cold') {
    next = compressTerminalOutput(text, 2400);
  }

  if (next === text) return message;
  return { ...message, content: replaceTextContent(message.content, next) };
}

function semanticFacts(text) {
  const source = String(text || '');
  const candidates = source.split(/\n|(?<=[.!?])\s+/).map((line) => line.trim()).filter(Boolean);
  const important = candidates.filter((line) =>
    /(?:[\\/][\\w.-]+\\.[a-z0-9]+\\b|\\b[a-zA-Z_$][\\w$]*\\([^)]{0,120}\\)|\\b(?:error|failed|exception|todo|fixme|decision|decided|must|should|require|expects?|returns?|port|branch|commit|test|api|endpoint|schema|signature)\\b)/i.test(line)
  );
  return [...new Set(important)].slice(0, 5).join(' | ').slice(0, 700);
}

function summarizeMessage(message) {
  const role = String(message?.role || 'message').toUpperCase();
  let text = extractText(message?.content).replace(/\s+/g, ' ').trim();
  const facts = semanticFacts(extractText(message?.content));

  const toolNames = [];
  if (Array.isArray(message?.tool_calls)) {
    for (const call of message.tool_calls) {
      const name = call?.function?.name || call?.name || call?.type;
      if (name) toolNames.push(name);
    }
  }
  if (message?.function_call?.name) toolNames.push(message.function_call.name);

  if (toolNames.length) {
    text = `${text} [tools: ${toolNames.join(', ')}]`.trim();
  }

  if (!text) return `[${role}] structured/tool event retained in active-session memory`;
  const excerpt = text.slice(0, 360);
  return `[${role}] ${excerpt}${facts && !excerpt.includes(facts) ? ` | KEY: ${facts}` : ''}`;
}

function collectHistoricalAnchors(turns) {
  const anchors = [];
  for (const turn of turns || []) {
    for (const message of turn) {
      const facts = semanticFacts(extractText(message?.content));
      if (!facts) continue;
      for (const fact of facts.split(' | ')) {
        const normalized = fact.trim();
        if (normalized && !anchors.includes(normalized)) anchors.push(normalized);
        if (anchors.length >= 24) return anchors;
      }
    }
  }
  return anchors;
}

function summarizeTurns(turns) {
  const lines = [];
  let number = 1;

  for (const turn of turns || []) {
    const parts = turn.map(summarizeMessage).filter(Boolean);
    if (parts.length) {
      lines.push(`Turn ${number}: ${parts.join(' | ')}`);
      number += 1;
    }
  }

  const anchors = collectHistoricalAnchors(turns);
  const anchorBlock = anchors.length
    ? `### Key historical anchors\n${anchors.map((anchor) => `- ${anchor}`).join('\n')}\n\n`
    : '';

  return `${anchorBlock}### Turn excerpts\n${lines.join('\n')}`;
}

function makeHistorySummary(text) {
  if (!text) return null;
  return {
    role: 'user',
    content:
      '# Compacted prior conversation\n' +
      'Older turns were compacted to keep the active prompt small. Exact details remain available only in active-session memory via memo_recall.\n\n' +
      text,
  };
}

function trimMessageTo(message, maxSize) {
  if (!message || maxSize <= 0) return message;
  if (messageSize(message) <= maxSize) return message;

  if (hasStructuredContent(message) || message.tool_calls || message.function_call) return message;
  const text = extractText(message.content);
  if (!text) return message;

  const overhead = Math.max(0, messageSize(message) - text.length);
  const allowedText = Math.max(120, maxSize - overhead - 80);
  const next = compressTerminalOutput(text, allowedText);
  return { ...message, content: replaceTextContent(message.content, next.slice(0, allowedText)) };
}

function boundRecentHistory(turns, maxChars) {
  let selected = [];
  let used = 0;

  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const turn = turns[i];
    const size = messagesSize(turn);
    if (selected.length === 0 && size > Math.floor(maxChars * 0.82)) {
      break;
    }
    if (used + size <= Math.floor(maxChars * 0.55)) {
      selected.unshift(turn);
      used += size;
    } else {
      break;
    }
  }

  const selectedCount = selected.length;
  const older = turns.slice(0, Math.max(0, turns.length - selectedCount));

  while (messagesSize(selected.flat()) > Math.floor(maxChars * 0.8) && selected.length > 1) {
    older.push(selected.shift());
  }

  let recentFlat = selected.flat();
  if (messagesSize(recentFlat) > Math.floor(maxChars * 0.82) && recentFlat.length) {
    const target = Math.floor(maxChars * 0.82 / recentFlat.length);
    recentFlat = recentFlat.map((message) => trimMessageTo(message, target));
  }

  const recentSize = messagesSize(recentFlat);
  const available = Math.max(0, maxChars - recentSize);
  let summaryText = summarizeTurns(older);
  let summary = summaryText ? makeHistorySummary(summaryText) : null;

  if (summary && messageSize(summary) > available) {
    const overhead = messageSize(makeHistorySummary(''));
    const textBudget = Math.max(0, available - overhead - 32);

    if (textBudget > 240) {
      const anchors = collectHistoricalAnchors(older);
      const anchorText = anchors.length
        ? `### Key historical anchors\n${anchors.map((anchor) => `- ${anchor}`).join('\n')}\n\n`
        : '';
      const anchorBudget = Math.min(anchorText.length, Math.floor(textBudget * 0.62));
      const keptAnchors = anchorText.slice(0, anchorBudget);
      const remaining = Math.max(0, textBudget - keptAnchors.length);
      const tail = remaining > 0 ? summaryText.slice(-remaining) : '';
      summaryText = `${keptAnchors}${tail}`;
      summary = makeHistorySummary(summaryText);
    } else {
      summary = null;
    }
  }

  let result = summary ? [summary, ...recentFlat] : [...recentFlat];

  while (messagesSize(result) > maxChars && result.length > 1 && result[0]?.content?.startsWith?.('# Compacted prior conversation')) {
    const summaryMsg = result[0];
    const over = messagesSize(result) - maxChars;
    const currentText = extractText(summaryMsg.content);
    const nextLen = Math.max(0, currentText.length - over - 64);
    if (nextLen < 180) {
      result.shift();
      break;
    }
    result[0] = { ...summaryMsg, content: currentText.slice(0, nextLen) };
  }

  if (messagesSize(result) > maxChars && result.length) {
    const budgetPerMessage = Math.max(160, Math.floor(maxChars / result.length));
    result = result.map((message) => trimMessageTo(message, budgetPerMessage));
  }

  return result;
}

function buildDirective() {
  const profile = profileStore.summary(1200);
  let directive =
    '[Context Compressor]\n' +
    '- Older conversation turns may be compacted. Before asking the user to repeat earlier-session details, use memo_recall.\n' +
    '- Active-session history is temporary and is not retained as long-term memory.\n' +
    '- Use profile_remember only for durable, useful preferences, workflow conventions, environment facts, or project decisions. Never store secrets or transient chatter as profile memory.';

  if (profile) {
    directive += `\n- Durable user/project profile facts:\n${profile}`;
  }
  return directive;
}

function injectSystemDirective(messages) {
  const directive = buildDirective();
  const result = [...messages];
  const index = result.findIndex((message) => message?.role === 'system');

  if (index >= 0) {
    const current = extractText(result[index].content);
    if (!current.includes('[Context Compressor]')) {
      result[index] = {
        ...result[index],
        content: replaceTextContent(result[index].content, `${current}\n\n${directive}`),
      };
    }
  } else {
    result.unshift({ role: 'system', content: directive });
  }

  return result;
}

function compressMessages(rawMessages, options = {}) {
  const cleaned = stripCommands(rawMessages);
  if (!cleaned.length) return [];

  const maxChars = Math.max(MIN_HISTORY_CHARS, Number(options.maxChars) || MAX_HISTORY_CHARS);
  const system = cleaned.filter((message) => message?.role === 'system');
  const conversation = cleaned.filter((message) => message?.role !== 'system');

  if (options.disabled) {
    return injectSystemDirective([...system, ...conversation]);
  }

  const turns = splitTurns(conversation);
  if (!turns.length) return injectSystemDirective([...system]);

  const activeTurn = turns[turns.length - 1];
  const historicalTurns = turns.slice(0, -1);

  const agedTurns = historicalTurns.map((turn, index) => {
    const distance = historicalTurns.length - 1 - index;
    const age = distance <= 1 ? 'warm' : 'cold';
    return turn.map((message) => transformMessage(message, age));
  });

  const agedHistory = agedTurns.flat();
  const trigger = Math.min(COMPACT_TRIGGER_CHARS, maxChars);

  let boundedHistory;
  if (messagesSize(agedHistory) <= trigger) {
    boundedHistory = agedHistory;
  } else {
    boundedHistory = boundRecentHistory(agedTurns, maxChars);
  }

  if (messagesSize(boundedHistory) > maxChars) {
    boundedHistory = boundRecentHistory(splitTurns(boundedHistory), maxChars);
  }

  return injectSystemDirective([
    ...system,
    ...boundedHistory,
    ...activeTurn,
  ]);
}

module.exports = {
  compressMessages,
  compressTerminalOutput,
  skeletonizeCode,
  trimSemanticNoise,
  stripCommands,
  splitTurns,
  isToolResponseUser,
  extractText,
  replaceTextContent,
  messagesSize,
  semanticFacts,
  collectHistoricalAnchors,
  hasStructuredContent,
  boundRecentHistory,
  MAX_HISTORY_CHARS,
};
