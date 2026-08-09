'use strict';

/**
 * Google Gemini API format handler
 * (/v1beta/models/{model}:generateContent or :streamGenerateContent)
 *
 * Gemini structure:
 *   {
 *     contents: [{role: "user"|"model", parts: [{text: "..."}]}],
 *     systemInstruction: { parts: [{text: "..."}] },
 *     generationConfig: { maxOutputTokens: ... }
 *   }
 *
 * Rules:
 *   - Only compress text parts — never touch functionCall / functionResponse parts
 *   - role "model" ↔ "assistant" conversion
 */

function geminiRoleToOpenAI(role) {
  return role === 'model' ? 'assistant' : role;
}

function openAIRoleToGemini(role) {
  return role === 'assistant' ? 'model' : role;
}

/**
 * Extract text content from a Gemini parts array (skip non-text).
 */
function partsToText(parts) {
  if (!Array.isArray(parts)) return '';
  return parts
    .filter((p) => p.text !== undefined)
    .map((p) => p.text)
    .join('');
}

/**
 * Convert Gemini body to OpenAI-style messages for compression.
 */
function extractMessages(body) {
  const msgs = [];
  if (body.systemInstruction) {
    const sysText = partsToText(body.systemInstruction.parts || []);
    if (sysText) msgs.push({ role: 'system', content: sysText });
  }
  for (const c of (body.contents || [])) {
    const textOnly = partsToText(c.parts || []);
    msgs.push({ role: geminiRoleToOpenAI(c.role), content: textOnly });
  }
  return msgs;
}

/**
 * Rebuild Gemini body from compressed OpenAI-style messages.
 * Preserves original non-text parts (functionCall, functionResponse, inlineData).
 */
function rebuildBody(original, compressedMessages) {
  const result = { ...original };

  // Rebuild systemInstruction
  const system = compressedMessages.find((m) => m.role === 'system');
  if (system) {
    result.systemInstruction = { parts: [{ text: system.content }] };
  }

  // Build contents from compressed messages
  const nonSystem = compressedMessages.filter((m) => m.role !== 'system');
  const originalContents = original.contents || [];

  result.contents = nonSystem.map((msg, idx) => {
    const origContent = originalContents[system ? idx : idx] || {};
    const nonTextParts = (origContent.parts || []).filter((p) => p.text === undefined);
    return {
      role: openAIRoleToGemini(msg.role),
      parts: [{ text: msg.content }, ...nonTextParts],
    };
  });

  return result;
}

/**
 * Get the last user text from Gemini body.
 */
function getLastUserText(body) {
  const contents = body.contents || [];
  const last = [...contents].reverse().find((c) => c.role === 'user');
  return last ? partsToText(last.parts || []) : '';
}

/**
 * Build a non-streaming Gemini response.
 */
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

/**
 * Build SSE streaming chunks for Gemini format.
 */
function buildStreamChunks(text) {
  return [
    `data: ${JSON.stringify({
      candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP', index: 0 }],
      usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 },
    })}\n\n`,
  ];
}

module.exports = { extractMessages, rebuildBody, getLastUserText, buildResponse, buildStreamChunks };
