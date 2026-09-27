'use strict';

function contentText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return typeof part === 'string' ? part : '';
      if (typeof part.text === 'string') return part.text;
      if (part.type === 'tool_result') {
        const inner = part.content;
        if (typeof inner === 'string') return inner;
        if (Array.isArray(inner)) {
          return inner.map((item) => item?.text || '').filter(Boolean).join('\n');
        }
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function extractMessages(body) {
  const messages = [];
  if (body.system !== undefined && body.system !== null) {
    messages.push({ role: 'system', content: body.system });
  }

  for (const message of (body.messages || [])) {
    messages.push({
      ...message,
      role: message.role,
      content: message.content,
    });
  }
  return messages;
}

function rebuildBody(original, compressedMessages) {
  const result = { ...original };
  const system = compressedMessages.find((message) => message.role === 'system');

  if (system) result.system = system.content;
  else delete result.system;

  result.messages = compressedMessages
    .filter((message) => message.role !== 'system')
    .map((message) => {
      const { role, content } = message;
      return { role, content };
    });

  return result;
}

function getLastUserText(body) {
  const messages = (body.messages || []).filter((message) => message.role === 'user');
  const last = messages[messages.length - 1];
  return last ? contentText(last.content) : '';
}

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

function sseEvent(name, payload) {
  return `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function buildStreamChunks(text) {
  const msgId = `msg-local-${Date.now()}`;
  return [
    sseEvent('message_start', {
      type: 'message_start',
      message: {
        id: msgId,
        type: 'message',
        role: 'assistant',
        content: [],
        model: 'context-compressor-local',
        stop_reason: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    }),
    sseEvent('content_block_start', {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    }),
    sseEvent('content_block_delta', {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text },
    }),
    sseEvent('content_block_stop', { type: 'content_block_stop', index: 0 }),
    sseEvent('message_delta', {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: 0 },
    }),
    sseEvent('message_stop', { type: 'message_stop' }),
  ];
}

module.exports = { extractMessages, rebuildBody, getLastUserText, buildResponse, buildStreamChunks, contentText };
