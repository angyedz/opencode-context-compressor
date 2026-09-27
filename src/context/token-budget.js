'use strict';

/**
 * Deterministic, dependency-free prompt cost estimation.
 * This intentionally avoids pretending to be an exact provider tokenizer:
 * its job is stable admission control before a request reaches the provider.
 */

function stringify(value) {
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch (_) { return String(value || ''); }
}

function classify(text) {
  const source = stringify(text);
  let ascii = 0, unicode = 0, punctuation = 0, whitespace = 0;
  for (const ch of source) {
    if (/\s/.test(ch)) whitespace += 1;
    else if (/[A-Za-z0-9_]/.test(ch)) ascii += 1;
    else if (ch.charCodeAt(0) > 127) unicode += 1;
    else punctuation += 1;
  }
  return { ascii, unicode, punctuation, whitespace, chars: source.length };
}

function estimateTokens(value) {
  const text = stringify(value);
  if (!text) return 0;
  let tokens = 0;
  const pieces = text.match(/[A-Za-z0-9_]+|[^\x00-\x7F]|[^A-Za-z0-9_\s]/g) || [];
  for (const piece of pieces) {
    if (/^[A-Za-z0-9_]+$/.test(piece)) tokens += Math.max(1, Math.ceil(piece.length / 4));
    else tokens += 1;
  }
  return tokens;
}

function estimateMessageTokens(message) {
  // Approximate provider framing overhead plus serialized payload.
  return estimateTokens(message) + 4;
}

function estimateMessagesTokens(messages) {
  return (messages || []).reduce((sum, message) => sum + estimateMessageTokens(message), 0);
}

function deriveCharBudget({ maxChars, maxTokens, tokenScale = 1, defaultChars = 16000, minChars = 2000 } = {}) {
  const chars = Number(maxChars);
  const tokens = Number(maxTokens);
  const scale = Math.max(0.25, Math.min(4, Number(tokenScale) || 1));
  const explicitChars = Number.isFinite(chars) && chars > 0;
  const charLimit = explicitChars ? chars : Math.max(minChars, defaultChars);
  // Token limits are strict caps. Calibration >1 means the raw estimator was
  // undercounting, so fewer characters may be admitted for the same token cap.
  const tokenLimitAsChars = Number.isFinite(tokens) && tokens > 0
    ? Math.max(0, Math.floor((tokens * 3.2) / scale))
    : Infinity;
  return Math.max(0, Math.min(charLimit, tokenLimitAsChars));
}

function budgetReport(messages, limits = {}) {
  const chars = stringify(messages).length;
  const tokens = estimateMessagesTokens(messages);
  const maxChars = deriveCharBudget(limits);
  const maxTokens = Number.isFinite(Number(limits.maxTokens)) ? Number(limits.maxTokens) : null;
  return {
    chars,
    tokens,
    maxChars,
    maxTokens,
    charUtilization: maxChars ? chars / maxChars : 0,
    tokenUtilization: maxTokens ? tokens / maxTokens : null,
  };
}

module.exports = {
  stringify,
  classify,
  estimateTokens,
  estimateMessageTokens,
  estimateMessagesTokens,
  deriveCharBudget,
  budgetReport,
};
