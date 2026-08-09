'use strict';

/**
 * OpenAI-compatible format handler (chat/completions)
 * Used by: OpenAI, DeepSeek, Qwen, most local providers
 */

/**
 * Extract messages array from OpenAI body.
 * Returns flat array [{role, content}].
 */
function extractMessages(body) {
  return Array.isArray(body.messages) ? body.messages : [];
}

/**
 * Rebuild body with new compressed messages.
 */
function rebuildBody(original, compressedMessages) {
  return { ...original, messages: compressedMessages };
}

/**
 * Get the last user text from messages array.
 */
function getLastUserText(body) {
  const msgs = extractMessages(body);
  const last = [...msgs].reverse().find((m) => m?.role === 'user');
  if (!last) return '';
  if (typeof last.content === 'string') return last.content;
  if (Array.isArray(last.content)) {
    return last.content.map((p) => (typeof p === 'string' ? p : p?.text || '')).join('');
  }
  return '';
}

/**
 * Build a non-streaming response.
 */
function buildResponse(text) {
  return {
    id: `chatcmpl-local-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'context-compressor-local',
    choices: [{
      index: 0,
      message: { role: 'assistant', content: text },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

/**
 * Build SSE streaming chunks for OpenAI format.
 */
function buildStreamChunks(text) {
  const id = `chatcmpl-local-${Date.now()}`;
  const base = { id, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: 'context-compressor-local' };
  return [
    `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }] })}\n\n`,
    `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { content: text }, finish_reason: null }] })}\n\n`,
    `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`,
    'data: [DONE]\n\n',
  ];
}

module.exports = { extractMessages, rebuildBody, getLastUserText, buildResponse, buildStreamChunks };
