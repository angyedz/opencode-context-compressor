'use strict';

/**
 * Protocol integrity checks used after compaction.
 * A compressor must never save tokens by emitting an impossible tool transcript.
 */

function collectOpenAI(messages) {
  const calls = new Map();
  const results = new Map();
  const duplicateCallIds = [];
  const duplicateResultIds = [];
  for (let index = 0; index < (messages || []).length; index += 1) {
    const message = messages[index];
    for (const call of message?.tool_calls || []) {
      if (call?.id) {
        if (calls.has(call.id)) duplicateCallIds.push({ id: call.id, firstIndex: calls.get(call.id), index });
        else calls.set(call.id, index);
      }
    }
    if (message?.role === 'tool' && message?.tool_call_id) {
      if (results.has(message.tool_call_id)) duplicateResultIds.push({ id: message.tool_call_id, firstIndex: results.get(message.tool_call_id), index });
      else results.set(message.tool_call_id, index);
    }
  }
  return { calls, results, duplicateCallIds, duplicateResultIds };
}

function collectAnthropic(messages) {
  const calls = new Map();
  const results = new Map();
  const duplicateCallIds = [];
  const duplicateResultIds = [];
  for (let index = 0; index < (messages || []).length; index += 1) {
    for (const part of messages[index]?.content || []) {
      if (part?.type === 'tool_use' && part.id) {
        if (calls.has(part.id)) duplicateCallIds.push({ id: part.id, firstIndex: calls.get(part.id), index });
        else calls.set(part.id, index);
      }
      if (part?.type === 'tool_result' && part.tool_use_id) {
        if (results.has(part.tool_use_id)) duplicateResultIds.push({ id: part.tool_use_id, firstIndex: results.get(part.tool_use_id), index });
        else results.set(part.tool_use_id, index);
      }
    }
  }
  return { calls, results, duplicateCallIds, duplicateResultIds };
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

function validatePairs(calls, results, duplicateCallIds = [], duplicateResultIds = []) {
  const orphanResults = [];
  const missingResults = [];
  const orderViolations = [];
  for (const [id, index] of results) {
    if (!calls.has(id)) orphanResults.push({ id, index });
    else if (calls.get(id) >= index) orderViolations.push({ id, callIndex: calls.get(id), resultIndex: index });
  }
  for (const [id, index] of calls) if (!results.has(id)) missingResults.push({ id, index });
  return { orphanResults, missingResults, orderViolations, duplicateCallIds, duplicateResultIds };
}

function validateToolProtocol(messages, { requireResults = false } = {}) {
  const openaiCollected = collectOpenAI(messages);
  const anthropicCollected = collectAnthropic(messages);
  const openai = validatePairs(openaiCollected.calls, openaiCollected.results, openaiCollected.duplicateCallIds, openaiCollected.duplicateResultIds);
  const anthropic = validatePairs(anthropicCollected.calls, anthropicCollected.results, anthropicCollected.duplicateCallIds, anthropicCollected.duplicateResultIds);
  const gemini = collectGemini(messages);

  const geminiOrphans = [];
  const geminiOrderViolations = [];
  const callQueues = new Map();
  for (const call of gemini.calls) {
    if (!callQueues.has(call.name)) callQueues.set(call.name, []);
    callQueues.get(call.name).push(call.index);
  }
  for (const result of gemini.results) {
    const queue = callQueues.get(result.name) || [];
    if (!queue.length) {
      geminiOrphans.push(result);
      continue;
    }
    const callIndex = queue.shift();
    if (callIndex >= result.index) geminiOrderViolations.push({ name: result.name, callIndex, resultIndex: result.index });
  }

  const invalidMissing =
    requireResults && (openai.missingResults.length > 0 || anthropic.missingResults.length > 0);
  return {
    valid:
      openai.orphanResults.length === 0 &&
      openai.orderViolations.length === 0 &&
      openai.duplicateCallIds.length === 0 &&
      openai.duplicateResultIds.length === 0 &&
      anthropic.orphanResults.length === 0 &&
      anthropic.orderViolations.length === 0 &&
      anthropic.duplicateCallIds.length === 0 &&
      anthropic.duplicateResultIds.length === 0 &&
      geminiOrphans.length === 0 &&
      geminiOrderViolations.length === 0 &&
      !invalidMissing,
    openai,
    anthropic,
    gemini: { orphanResults: geminiOrphans, orderViolations: geminiOrderViolations },
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
