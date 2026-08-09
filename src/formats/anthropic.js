'use strict';

/**
 * Anthropic Messages API format handler (/v1/messages)
 *
 * Anthropic structure:
 *   { model, system: "...", messages: [{role, content}], max_tokens, stream }
 *
 * Our compressor works in OpenAI style internally.
 * We convert Anthropic ↔ OpenAI for compression, then rebuild.
 */

/**
 * Convert Anthropic body to OpenAI-style messages array for compression.
 */
function extractMessages(body) {
  const msgs = [];
  if (body.system) {
    msgs.push({ role: 'system', content: body.system });
  }
  for (const m of (body.messages || [])) {
    const text = typeof m.content === 'string'
      ? m.content
      : Array.isArray(m.content)
        ? m.content.filter((p) => p.type === 'text').map((p) => p.text).join('\n')
        : '';
    msgs.push({ role: m.role, content: text });
  }
  return msgs;
}

/**
 * Rebuild Anthropic body from compressed OpenAI-style messages.
 */
function rebuildBody(original, compressedMessages) {
  const result = { ...original };
  if (!result.max_tokens) {
    result.max_tokens = 8192;
  }
  const system = compressedMessages.find((m) => m.role === 'system');
  if (system) result.system = system.content;
  result.messages = compressedMessages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }));
  return result;
}

/**
 * Get the last user text.
 */
function getLastUserText(body) {
  const msgs = (body.messages || []).filter((m) => m.role === 'user');
  const last = msgs[msgs.length - 1];
  if (!last) return '';
  if (typeof last.content === 'string') return last.content;
  if (Array.isArray(last.content)) {
    return last.content.filter((p) => p.type === 'text').map((p) => p.text).join('');
  }
  return '';
}

/**
 * Build a non-streaming Anthropic response.
 */
function buildResponse(text) {
  return {
    id: `msg-local-${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text }],
    model: 'context-compressor-local',
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}

/**
 * Build SSE streaming chunks for Anthropic format.
 */
function buildStreamChunks(text) {
  const msgId = `msg-local-${Date.now()}`;
  return [
    `event: message_start\ndata: ${JSON.stringify({ type: 'message_start', message: { id: msgId, type: 'message', role: 'assistant', content: [], model: 'context-compressor-local', stop_reason: null, usage: { input_tokens: 0, output_tokens: 0 } } })}\n\n`,
    `event: content_block_start\ndata: ${JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })}\n\n`,
    `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })}\n\n`,
    `event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}\n\n`,
    `event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 0 } })}\n\n`,
    `event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`,
  ];
}

module.exports = { extractMessages, rebuildBody, getLastUserText, buildResponse, buildStreamChunks };
