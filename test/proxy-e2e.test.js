'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const tokenCalibration = require('../src/context/token-calibration');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}
function close(server) {
  return new Promise((resolve) => {
    if (!server || !server.listening) return resolve();
    server.close(resolve);
  });
}
function requestViaProxy(proxyPort, targetPort, pathname, body) {
  return new Promise((resolve, reject) => {
    const raw = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const req = http.request({
      host: '127.0.0.1', port: proxyPort, method: 'POST',
      path: `http://127.0.0.1:${targetPort}${pathname}`,
      headers: { host: `127.0.0.1:${targetPort}`, 'content-type': 'application/json', 'content-length': raw.length },
    }, (res) => {
      const chunks=[];
      res.on('data', c=>chunks.push(c));
      res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(chunks).toString()}));
    });
    req.on('error', reject);
    req.end(raw);
  });
}

test('real proxy compresses history, preserves active turn, and learns provider token usage', async () => {
  let received;
  const upstream = http.createServer((req,res) => {
    if (req.method === 'GET' && req.url === '/healthz') {
      res.writeHead(404, {'content-type':'application/json'});
      return res.end(JSON.stringify({ok:false}));
    }

    const chunks=[];
    req.on('data',c=>chunks.push(c));
    req.on('end',()=>{
      try {
        received=JSON.parse(Buffer.concat(chunks).toString());
      } catch (_) {
        res.writeHead(400);
        return res.end('bad json');
      }
      res.writeHead(200, {'content-type':'application/json'});
      res.end(JSON.stringify({
        id:'mock-response',
        choices:[{message:{role:'assistant',content:'ok'}}],
        usage:{prompt_tokens:1234,completion_tokens:5,total_tokens:1239},
      }));
    });
  });

  let proxy;
  try {
    const upstreamPort=await listen(upstream);
    process.env.PROXY_PORT='0';
    proxy=require('../src/proxy');
    if (!proxy.listening) await new Promise(r=>proxy.once('listening',r));
    const proxyPort=proxy.address().port;

    tokenCalibration.clear('127.0.0.1','test-model');

    const messages=[];
    for(let i=0;i<35;i++){
      messages.push({role:'user',content:'old-'+i+' '+ 'x'.repeat(1800)});
      messages.push({role:'assistant',content:'reply-'+i+' '+ 'y'.repeat(1800)});
    }
    messages.push({role:'user',content:'CURRENT-TURN-MUST-STAY-EXACT'});
    const originalSize=JSON.stringify(messages).length;

    const result=await requestViaProxy(proxyPort,upstreamPort,'/v1/chat/completions',{model:'test-model',messages});
    assert.equal(result.status,200);
    assert.ok(received);
    assert.equal(received.messages.at(-1).content,'CURRENT-TURN-MUST-STAY-EXACT');
    assert.ok(JSON.stringify(received.messages).length < originalSize / 2);

    const calibration=tokenCalibration.get('127.0.0.1','test-model');
    assert.equal(calibration.samples,1);
    assert.ok(calibration.factor>0);
  } finally {
    await close(proxy);
    await close(upstream);
  }
});
