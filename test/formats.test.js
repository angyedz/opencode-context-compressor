'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const anthropic = require('../src/formats/anthropic');
const gemini = require('../src/formats/gemini');

test('Anthropic tool_use and tool_result blocks round-trip without flattening', () => {
  const body = {
    model: 'claude-test',
    system: [{ type: 'text', text: 'system text' }],
    messages: [
      { role: 'user', content: [{ type: 'text', text: 'Inspect the repo.' }] },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'I will inspect it.' },
          { type: 'tool_use', id: 'toolu_1', name: 'read_file', input: { path: 'src/a.js' } },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_1',
            content: [{ type: 'text', text: 'file contents' }],
          },
        ],
      },
    ],
  };

  const extracted = anthropic.extractMessages(body);
  const rebuilt = anthropic.rebuildBody(body, extracted);

  assert.deepEqual(rebuilt.system, body.system);
  assert.deepEqual(rebuilt.messages, body.messages);
  assert.equal(rebuilt.messages[1].content[1].type, 'tool_use');
  assert.equal(rebuilt.messages[2].content[0].type, 'tool_result');
});

test('Gemini functionCall and functionResponse parts round-trip without flattening', () => {
  const body = {
    systemInstruction: { parts: [{ text: 'system text' }] },
    contents: [
      { role: 'user', parts: [{ text: 'Inspect the repo.' }] },
      {
        role: 'model',
        parts: [
          { text: 'Calling tool.' },
          { functionCall: { name: 'read_file', args: { path: 'src/a.js' } } },
        ],
      },
      {
        role: 'user',
        parts: [
          { functionResponse: { name: 'read_file', response: { content: 'file contents' } } },
        ],
      },
    ],
  };

  const extracted = gemini.extractMessages(body);
  const rebuilt = gemini.rebuildBody(body, extracted);

  assert.deepEqual(rebuilt.systemInstruction, body.systemInstruction);
  assert.deepEqual(rebuilt.contents, body.contents);
  assert.equal(rebuilt.contents[1].parts[1].functionCall.name, 'read_file');
  assert.equal(rebuilt.contents[2].parts[0].functionResponse.name, 'read_file');
});
