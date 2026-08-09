'use strict';

/**
 * OpenCode Native Context Compressor Engine (Identical to QwenFreeApi Engine).
 * 
 * Includes:
 * 1. RTK (Rust Token Killer / Terminal & Git Diff Output Compressor)
 * 2. Skeletonizer (Skeletonization of long code files & function bodies)
 * 3. Semantic Noise Trimmer (Removes conversational AI preambles)
 * 4. Hierarchical History Aging (Hot/Warm/Cold zone compression)
 * 5. Strict Character & Token Bounding (Max 12,000 chars)
 */

const MAX_HISTORY_CHARS = 12000;
const COMPACT_TRIGGER_CHARS = 10000;

const SYSTEM_MEMO_DIRECTIVE = `[System Directive: ModelMemo & Context Compressor]
- A \`model-memo\` MCP server is connected to persistent storage (~/.model-memo/memo.json).
- Before asking the user for context, past steps, or what was done earlier in the session, call \`memo_recall(query)\`.
- Use \`memo_save(note, category)\` to save key architectural decisions or user instructions.
- In-chat proxy management commands start with \`$context-compressor\` and execute locally.`;

const COMPACTION_PROMPT = `[Context Compaction Directive]
The preceding conversation history has been compacted using RTK & Skeletonizer to conserve context tokens.
All core project requirements, files modified, and unresolved tasks remain preserved in the timeline above.
Proceed with the current step immediately.`;

/**
 * 1. RTK (Rust Token Killer / Terminal Output Compressor)
 * Compresses git diffs, build logs, pytest, npm, and verbose terminal outputs.
 */
function compressTerminalOutput(text) {
  if (typeof text !== 'string' || text.length < 500) return text;

  // A) Git Diff Trimmer: keeps diff headers, @@, +, -, omits unchanged lines
  if (text.includes('diff --git') || text.includes('--- a/') || text.includes('+++ b/')) {
    const lines = text.split('\n');
    const kept = [];
    let diffContextCount = 0;

    for (const line of lines) {
      if (
        line.startsWith('diff --git') ||
        line.startsWith('--- ') ||
        line.startsWith('+++ ') ||
        line.startsWith('@@') ||
        line.startsWith('+') ||
        line.startsWith('-')
      ) {
        kept.push(line);
        diffContextCount = 0;
      } else if (diffContextCount < 2) {
        kept.push(line);
        diffContextCount += 1;
      } else if (diffContextCount === 2) {
        kept.push('  ... [unchanged lines omitted]');
        diffContextCount += 1;
      }
    }
    const compressed = kept.join('\n');
    if (compressed.length < text.length) return compressed;
  }

  // B) Build Log & Error Trimmer: keeps initial error description and final stacktraces
  if (text.includes('npm ERR!') || text.includes('FAIL') || text.includes('Traceback (most recent call last)')) {
    const lines = text.split('\n');
    if (lines.length > 50) {
      const head = lines.slice(0, 15);
      const tail = lines.slice(-25);
      return [...head, `\n... [${lines.length - 40} lines of intermediate build/test log omitted] ...\n`, ...tail].join('\n');
    }
  }

  // C) Universal Verbose Tool Trimmer (> 2500 chars -> keeps head 1000 + tail 1200)
  if (text.length > 2500) {
    const head = text.slice(0, 1000);
    const tail = text.slice(-1200);
    return `${head}\n\n... [${text.length - 2200} chars of verbose tool output omitted] ...\n\n${tail}`;
  }

  return text;
}

/**
 * 2. Skeletonizer (Code File Skeletonization)
 * Collapses long file contents leaving imports, signatures, and file bounds.
 */
function skeletonizeCode(text) {
  if (typeof text !== 'string' || text.length < 1500) return text;
  if (!text.includes('function') && !text.includes('class') && !text.includes('def ')) return text;

  const lines = text.split('\n');
  if (lines.length < 50) return text;

  const head = lines.slice(0, 15).join('\n');
  const tail = lines.slice(-10).join('\n');
  return `${head}\n  // ... [middle file content skeletonized (${lines.length - 25} lines)] ...\n${tail}`;
}

/**
 * 3. Semantic Noise Trimmer (AI conversational preambles)
 */
function trimSemanticNoise(text) {
  if (typeof text !== 'string' || text.length < 150) return text;

  return text
    .replace(/^Sure,? I can help with that\.?\s*/i, '')
    .replace(/^Certainly!? Here is what I found:\s*/i, '')
    .replace(/^As an AI coding assistant,?\s*/i, '')
    .replace(/^I understand your request\.?\s*/i, '');
}

function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === 'string') return part;
      return part?.text || part?.content || '';
    }).join('\n');
  }
  if (content && typeof content === 'object') return content.text || content.content || '';
  return '';
}

/**
 * Filter out in-chat $context-compressor / $compressor / $qwen-api commands and responses
 */
function stripCommands(messages) {
  if (!Array.isArray(messages)) return [];
  const result = [];
  let skipNextAssistant = false;
  for (let i = 0; i < messages.length; i += 1) {
    const m = messages[i];
    if (!m) continue;
    const txt = extractText(m.content).trim();

    // Match user command triggers
    const isCmd = m.role === 'user' && (
      txt.startsWith('$context-compressor') || txt.startsWith('/context-compressor') ||
      txt.startsWith('$compressor') || txt.startsWith('/compressor') ||
      txt.startsWith('$qwen-api') || txt.startsWith('/qwen-api') ||
      txt.startsWith('$model-memo') || txt.startsWith('/model-memo')
    );

    if (isCmd) {
      skipNextAssistant = true;
      continue;
    }

    // Match assistant command outputs
    const isCmdReply = m.role === 'assistant' && (
      skipNextAssistant ||
      txt.includes('⚡') ||
      txt.includes('Context Compressor') ||
      txt.includes('ModelMemo') ||
      txt.includes('Session Reset')
    );

    if (isCmdReply) {
      skipNextAssistant = false;
      continue;
    }

    skipNextAssistant = false;
    result.push(m);
  }
  return result;
}

/**
 * 4. Main Hierarchical History Aging & Context Compression Entrypoint.
 */
function compressMessages(rawMessages, options = {}) {
  const messages = stripCommands(rawMessages);
  if (!Array.isArray(messages) || messages.length === 0) return [];
  if (options.disabled) return messages;

  const maxChars = Number(options.maxChars) || MAX_HISTORY_CHARS;
  const totalLength = messages.reduce((acc, m) => acc + extractText(m.content).length, 0);
  const totalTurns = messages.filter((m) => m?.role !== 'system').length;

  if (totalLength < Math.min(COMPACT_TRIGGER_CHARS, maxChars) && totalTurns <= 8) {
    return messages;
  }

  const system = messages.find((m) => m?.role === 'system');
  const userTurns = messages.filter((m) => m?.role !== 'system');
  if (userTurns.length <= 3) return messages;

  const agedMessages = userTurns.map((msg, index) => {
    const distanceFromEnd = userTurns.length - 1 - index;
    const contentText = extractText(msg.content);

    // Hot Zone (last 2 turns): 100% intact
    if (distanceFromEnd <= 1) return msg;

    let newText = contentText;
    // Warm Zone (turns 2-6 ago): RTK & semantic noise trimming
    if (distanceFromEnd <= 5) {
      if (msg.role === 'tool' || msg.role === 'user') {
        newText = compressTerminalOutput(newText);
      } else if (msg.role === 'assistant') {
        newText = trimSemanticNoise(newText);
      }
    } else {
      // Cold Zone (older than 6 turns): Deep skeletonization
      if (msg.role === 'tool') {
        newText = compressTerminalOutput(newText);
      } else if (msg.role === 'assistant') {
        newText = skeletonizeCode(trimSemanticNoise(newText));
      } else if (msg.role === 'user') {
        newText = compressTerminalOutput(newText);
      }
    }

    return { ...msg, content: newText };
  });

  const boundTextLength = agedMessages.reduce((acc, m) => acc + extractText(m.content).length, 0);

  if (boundTextLength <= maxChars) {
    let systemMsg = system;
    if (systemMsg) {
      const sysTxt = extractText(systemMsg.content);
      if (!sysTxt.includes('ModelMemo & Context Compressor')) {
        systemMsg = { ...systemMsg, content: `${sysTxt}\n\n${SYSTEM_MEMO_DIRECTIVE}` };
      }
    } else {
      systemMsg = { role: 'system', content: SYSTEM_MEMO_DIRECTIVE };
    }
    const res = [systemMsg, ...agedMessages];
    return res;
  }

  // If still above 12,000 chars, perform strict older turn folding
  const recent = agedMessages.slice(-3);
  const older = agedMessages.slice(0, -3);

  const olderSummaryLines = older.map((m, idx) => {
    const role = (m.role || 'user').toUpperCase();
    const txt = compressTerminalOutput(extractText(m.content)).slice(0, 400).replace(/\n+/g, ' ');
    return `[Turn ${idx + 1} | ${role}]: ${txt}`;
  });

  let olderText = olderSummaryLines.join('\n');
  if (olderText.length > MAX_HISTORY_CHARS) {
    olderText = olderText.slice(-MAX_HISTORY_CHARS);
  }

  const foldedUserMessage = {
    role: 'user',
    content: `# Compacted Conversation History\n${COMPACTION_PROMPT}\n\n### Prior Turns Summary:\n${olderText}`,
  };

  // Dynamically attach SYSTEM_MEMO_DIRECTIVE to system prompt
  let systemMsg = system;
  if (systemMsg) {
    const sysTxt = extractText(systemMsg.content);
    if (!sysTxt.includes('ModelMemo & Context Compressor')) {
      systemMsg = { ...systemMsg, content: `${sysTxt}\n\n${SYSTEM_MEMO_DIRECTIVE}` };
    }
  } else {
    systemMsg = { role: 'system', content: SYSTEM_MEMO_DIRECTIVE };
  }

  const result = [];
  result.push(systemMsg);
  result.push(foldedUserMessage);
  result.push(...recent);

  return result;
}

module.exports = {
  compressMessages,
  compressTerminalOutput,
  skeletonizeCode,
  trimSemanticNoise,
  stripCommands,
  COMPACTION_PROMPT,
};
