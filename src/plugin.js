'use strict';

/**
 * OpenCode Native Plugin & Hook Injection.
 * 
 * Injects context compression and temporary session recall and minimal durable profile memory
 * directly into OpenCode's execution loop without passing through an external tunnel.
 */

const compressor = require('./compressor');
const memoStore = require('./memo-store');
const commands = require('./commands');
const compressionReport = require('./context/compression-report');
const runtimeMetrics = require('./context/runtime-metrics');

function compressAndRecord(messages, sessionKey, options = {}) {
  const disabled = commands.isCompressorDisabled(sessionKey) || options.compressorDisabled === true;
  const maxChars = options.maxChars || commands.getSessionLimit(sessionKey);
  const maxTokens = options.maxTokens ?? commands.getSessionTokenLimit(sessionKey);
  const maxInputTokens = options.maxInputTokens ?? commands.getSessionInputLimit(sessionKey);
  const reserveOutputTokens = options.reserveOutputTokens ?? commands.getSessionOutputReserve(sessionKey);
  const compressorOptions = { ...options, disabled, maxChars, maxTokens, maxInputTokens, reserveOutputTokens };
  const compressed = compressor.compressMessages(messages, compressorOptions);
  const report = compressionReport.publicReport(
    compressionReport.buildCompressionReport(messages, compressed, { maxChars, maxTokens, maxInputTokens, reserveOutputTokens })
  );
  runtimeMetrics.touch(sessionKey, report);
  return compressed;
}

/**
 * Core Message Injection & Command Interceptor
 */
function opencodeInjection(messages, options = {}) {
  const sessionKey = options.sessionKey || options.sessionId || memoStore.deriveSessionKey(messages, { provider: 'opencode', model: options.model || '' });

  // Refresh temporary recall from the exact request before command handling or compaction.
  memoStore.syncMessages(sessionKey, messages);

  // 1. Intercept in-chat commands ($context-compressor off, $memo, $help)
  if (commands.isCommandMessage(messages)) {
    const replyText = commands.executeCommand(messages, sessionKey);
    return {
      intercepted: true,
      replyText,
      messages: [
        { role: 'assistant', content: replyText },
      ],
    };
  }

  // 2. Compress context if compaction is enabled
  const compressed = compressAndRecord(messages, sessionKey, options);

  return {
    intercepted: false,
    messages: compressed,
  };
}

/**
 * OpenCode Plugin Export Interface
 */
function OpenCodePlugin(opencode) {
  return {
    'chat.transformMessages': ({ messages, session }) => {
      const sessionKey = session?.id || memoStore.deriveSessionKey(messages, { provider: 'opencode' });
      memoStore.syncMessages(sessionKey, messages);
      return compressAndRecord(messages, sessionKey);
    },
    'experimental.chat.transformMessages': ({ messages, session }) => {
      const sessionKey = session?.id || memoStore.deriveSessionKey(messages, { provider: 'opencode' });
      memoStore.syncMessages(sessionKey, messages);
      return compressAndRecord(messages, sessionKey);
    },
  };
}

OpenCodePlugin.opencodeInjection = opencodeInjection;
OpenCodePlugin.compressor = compressor;
OpenCodePlugin.memoStore = memoStore;
OpenCodePlugin.commands = commands;
OpenCodePlugin.compressAndRecord = compressAndRecord;

module.exports = OpenCodePlugin;
module.exports.default = OpenCodePlugin;
module.exports.opencodeInjection = opencodeInjection;
module.exports.compressor = compressor;
module.exports.memoStore = memoStore;
module.exports.commands = commands;
module.exports.compressAndRecord = compressAndRecord;
