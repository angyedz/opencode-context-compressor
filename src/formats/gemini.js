'use strict';

function geminiRoleToOpenAI(role) {
  return role === 'model' ? 'assistant' : role;
}

function openAIRoleToGemini(role) {
  return role === 'assistant' ? 'model' : role;
}

function partsToText(parts) {
  if (!Array.isArray(parts)) return '';
  return parts
    .filter((part) => part && typeof part.text === 'string')
    .map((part) => part.text)
    .join('');
}

function extractMessages(body) {
  const messages = [];

  if (body.systemInstruction) {
    messages.push({
      role: 'system',
      content: body.systemInstruction.parts || [],
      __geminiSystemMeta: Object.fromEntries(
        Object.entries(body.systemInstruction).filter(([key]) => key !== 'parts')
      ),
    });
  }

  for (const content of (body.contents || [])) {
    messages.push({
      role: geminiRoleToOpenAI(content.role),
      content: content.parts || [],
      __geminiMeta: Object.fromEntries(
        Object.entries(content).filter(([key]) => key !== 'role' && key !== 'parts')
      ),
    });
  }

  return messages;
}

function normalizeParts(content) {
  if (Array.isArray(content)) return content;
  if (typeof content === 'string') return [{ text: content }];
  if (content && typeof content === 'object' && typeof content.text === 'string') return [content];
  return [];
}

function rebuildBody(original, compressedMessages) {
  const result = { ...original };
  const system = compressedMessages.find((message) => message.role === 'system');

  if (system) {
    result.systemInstruction = {
      ...(system.__geminiSystemMeta || {}),
      parts: normalizeParts(system.content),
    };
  } else {
    delete result.systemInstruction;
  }

  result.contents = compressedMessages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      ...(message.__geminiMeta || {}),
      role: openAIRoleToGemini(message.role),
      parts: normalizeParts(message.content),
    }));

  return result;
}

function getLastUserText(body) {
  const last = [...(body.contents || [])].reverse().find((content) => content.role === 'user');
  return last ? partsToText(last.parts || []) : '';
}

function buildResponse(text) {
  return {
    candidates: [{
      content: { role: 'model', parts: [{ text }] },
      finishReason: 'STOP',
      index: 0,
    }],
    usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 },
  };
}

function buildStreamChunks(text) {
  return [
    `data: ${JSON.stringify({
      candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP', index: 0 }],
      usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 },
    })}\n\n`,
  ];
}

module.exports = {
  extractMessages,
  rebuildBody,
  getLastUserText,
  buildResponse,
  buildStreamChunks,
  partsToText,
};
