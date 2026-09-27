'use strict';

/**
 * Protocol integrity checks used after compaction.
 * A compressor must never save tokens by emitting an impossible tool transcript.
 */

function collectOpenAI(messages) {
  const calls = new Map();
  const results = new Map();
  for (let index = 0; index < (messages || []).length; index += 1) {
    const message = messages[index];
    for (const call of message?.tool_calls || []) {
      if (call?.id) calls.set(call.id, index);
    }
    if (message?.role === 'tool' && message?.tool_call_id) {
      results.set(message.tool_call_id, index);
    }
  }
  return { calls, results };
}

function collectAnthropic(messages) {
  const calls = new Map();
  const results = new Map();
  for (let index = 0; index < (messages || []).length; index += 1) {
    for (const part of messages[index]?.content || []) {
      if (part?.type === 'tool_use' && part.id) calls.set(part.id, index);
      if (part?.type === 'tool_result' && part.tool_use_id) results.set(part.tool_use_id, index);
    }
  }
  return { calls, results };
}

function collectGemini(messages) {
  const calls = [];
  const results = [];
  for (let index = 0; index < (messages || []).length; index += 1) {
    for (const part of messages[index]?.content || []) {
      if (part?.functionCall?.name) calls.push({ name: part.functionCall.name, index });
      if (part?.functionResponse?.name) results.push({ name: part.functionResponse.name, index });
    }
  }
  return { calls, results };
}

function validatePairs(calls, results) {
  const orphanResults = [];
  const missingResults = [];
  for (const [id, index] of results) if (!calls.has(id)) orphanResults.push({ id, index });
  for (const [id, index] of calls) if (!results.has(id)) missingResults.push({ id, index });
  return { orphanResults, missingResults };
}

function validateToolProtocol(messages, { requireResults = false } = {}) {
  const openai = validatePairs(...Object.values(collectOpenAI(messages)));
  const anthropic = validatePairs(...Object.values(collectAnthropic(messages)));
  const gemini = collectGemini(messages);

  const geminiOrphans = [];
  const seenCalls = new Map();
  for (const call of gemini.calls) seenCalls.set(call.name, (seenCalls.get(call.name) || 0) + 1);
  for (const result of gemini.results) {
    const count = seenCalls.get(result.name) || 0;
    if (count <= 0) geminiOrphans.push(result);
    else seenCalls.set(result.name, count - 1);
  }

  const invalidMissing =
    requireResults && (openai.missingResults.length > 0 || anthropic.missingResults.length > 0);
  return {
    valid:
      openai.orphanResults.length === 0 &&
      anthropic.orphanResults.length === 0 &&
      geminiOrphans.length === 0 &&
      !invalidMissing,
    openai,
    anthropic,
    gemini: { orphanResults: geminiOrphans },
  };
}

function assertToolProtocol(messages, options) {
  const report = validateToolProtocol(messages, options);
  if (!report.valid) {
    const error = new Error('Context compression produced an invalid tool protocol transcript');
    error.code = 'ERR_CONTEXT_TOOL_PROTOCOL';
    error.report = report;
    throw error;
  }
  return messages;
}

module.exports = {
  collectOpenAI,
  collectAnthropic,
  collectGemini,
  validateToolProtocol,
  assertToolProtocol,
};
