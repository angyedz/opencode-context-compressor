'use strict';

/**
 * OpenCode Native Plugin & Hook Injection.
 * 
 * Injects context compression and persistent model-memo timeline memory
 * directly into OpenCode's execution loop without passing through an external tunnel.
 */

const compressor = require('./compressor');
const memoStore = require('./memo-store');
const commands = require('./commands');

/**
 * Core Message Injection & Command Interceptor
 */
function opencodeInjection(messages, options = {}) {
  const sessionKey = options.sessionKey || options.sessionId || 'default-opencode-session';

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

  // 2. Sync history to persistent model-memo timeline store
  memoStore.syncMessages(sessionKey, messages);

  // 3. Compress context if compaction is enabled
  const disabled = commands.isCompressorDisabled(sessionKey) || options.compressorDisabled === true;
  const compressed = compressor.compressMessages(messages, { ...options, disabled });

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
      const sessionKey = session?.id || 'default-opencode-session';
      memoStore.syncMessages(sessionKey, messages);
      const disabled = commands.isCompressorDisabled(sessionKey);
      return compressor.compressMessages(messages, { disabled });
    },
    'experimental.chat.transformMessages': ({ messages, session }) => {
      const sessionKey = session?.id || 'default-opencode-session';
      memoStore.syncMessages(sessionKey, messages);
      const disabled = commands.isCompressorDisabled(sessionKey);
      return compressor.compressMessages(messages, { disabled });
    },
  };
}

OpenCodePlugin.opencodeInjection = opencodeInjection;
OpenCodePlugin.compressor = compressor;
OpenCodePlugin.memoStore = memoStore;
OpenCodePlugin.commands = commands;

module.exports = OpenCodePlugin;
module.exports.default = OpenCodePlugin;
module.exports.opencodeInjection = opencodeInjection;
module.exports.compressor = compressor;
module.exports.memoStore = memoStore;
module.exports.commands = commands;
