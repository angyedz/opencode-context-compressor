'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

test('opencode-cc launches a real child with scoped proxy and CA environment', { skip: process.platform === 'win32' }, () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'occ-launcher-'));
  const fake=path.join(dir,'opencode');
  const capture=path.join(dir,'capture.json');
  fs.writeFileSync(fake, `#!/usr/bin/env node
const fs=require('fs');
if(process.argv.includes('--version')) process.exit(0);
fs.writeFileSync(process.env.OCC_CAPTURE, JSON.stringify({
 args:process.argv.slice(2),
 HTTP_PROXY:process.env.HTTP_PROXY,
 HTTPS_PROXY:process.env.HTTPS_PROXY,
 NODE_EXTRA_CA_CERTS:process.env.NODE_EXTRA_CA_CERTS
}));
`, {mode:0o755});

  const env={...process.env, PATH:dir+path.delimiter+process.env.PATH, OCC_CAPTURE:capture, CONTEXT_COMPRESSOR_PORT:'0'};
  const run=spawnSync(process.execPath,[path.join(__dirname,'..','bin','opencode-cc.js'),'--model','demo'],{env,encoding:'utf8',timeout:20000});
  assert.equal(run.status,0, run.stderr);
  const got=JSON.parse(fs.readFileSync(capture,'utf8'));
  assert.deepEqual(got.args,['--model','demo']);
  assert.match(got.HTTP_PROXY,/^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(got.HTTPS_PROXY,got.HTTP_PROXY);
  assert.match(got.NODE_EXTRA_CA_CERTS,/ca\.crt$/);
  fs.rmSync(dir,{recursive:true,force:true});
});
