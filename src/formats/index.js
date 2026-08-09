'use strict';

const openai = require('./openai');
const anthropic = require('./anthropic');
const gemini = require('./gemini');

/**
 * Detect API format from request URL and body.
 * Returns: 'openai' | 'anthropic' | 'gemini' | null
 */
function detectFormat(pathname, body) {
  if (!pathname) return null;
  if (pathname.includes(':generateContent') || pathname.includes(':streamGenerateContent')) return 'gemini';
  if (pathname.includes('/v1/messages') || pathname.includes('/v1beta/messages')) return 'anthropic';
  if (pathname.includes('/chat/completions')) return 'openai';
  // Fallback: check body structure
  if (body && body.contents) return 'gemini';
  if (body && body.system !== undefined && !body.messages?.find?.((m) => m.role === 'system')) return 'anthropic';
  if (body && Array.isArray(body.messages)) return 'openai';
  return null;
}

const HANDLERS = { openai, anthropic, gemini };

function handler(format) {
  return HANDLERS[format] || null;
}

/**
 * Extract OpenAI-style messages from any format body.
 */
function extractMessages(body, format) {
  const h = handler(format);
  return h ? h.extractMessages(body) : [];
}

/**
 * Get the last user text from any format body.
 */
function getLastUserText(body, format) {
  const h = handler(format);
  return h ? h.getLastUserText(body) : '';
}

/**
 * Rebuild body with compressed messages for the given format.
 */
function rebuildBody(original, compressedMessages, format) {
  const h = handler(format);
  return h ? h.rebuildBody(original, compressedMessages) : original;
}

/**
 * Build a command response in the correct format.
 */
function buildCommandResponse(text, format, isStream) {
  const h = handler(format);
  if (!h) return { error: 'unknown format' };
  if (isStream) return h.buildStreamChunks(text);
  return h.buildResponse(text);
}

/**
 * Content-Type for stream responses.
 */
function streamContentType(format) {
  return format === 'anthropic' ? 'text/event-stream' : 'text/event-stream';
}

module.exports = { detectFormat, extractMessages, getLastUserText, rebuildBody, buildCommandResponse, streamContentType };
