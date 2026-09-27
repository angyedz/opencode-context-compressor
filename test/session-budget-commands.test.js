'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const commands=require('../src/commands');

test('session token window and reserve commands update independent controls',()=>{
  const key='budget-command-test';
  commands.executeCommand([{role:'user',content:'$compressor tokens 8k'}],key);
  commands.executeCommand([{role:'user',content:'$compressor window 64k'}],key);
  commands.executeCommand([{role:'user',content:'$compressor reserve 6k'}],key);
  assert.equal(commands.getSessionTokenLimit(key),8000);
  assert.equal(commands.getSessionInputLimit(key),64000);
  assert.equal(commands.getSessionOutputReserve(key),6000);
  commands.executeCommand([{role:'user',content:'$reset'}],key);
  assert.equal(commands.getSessionTokenLimit(key),null);
  assert.equal(commands.getSessionInputLimit(key),null);
  assert.equal(commands.getSessionOutputReserve(key),4096);
});

test('status exposes token and envelope controls',()=>{
  const key='budget-status-test';
  commands.executeCommand([{role:'user',content:'$compressor tokens 7k'}],key);
  commands.executeCommand([{role:'user',content:'$compressor window 32k'}],key);
  const status=commands.executeCommand([{role:'user',content:'$compressor status'}],key);
  assert.match(status,/7,000/);
  assert.match(status,/32,000/);
  commands.executeCommand([{role:'user',content:'$reset'}],key);
});
