'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}
function close(server) { return new Promise((resolve) => server.close(resolve)); }
function requestViaProxy(proxyPort, targetPort, pathname, body) {
  return new Promise((resolve, reject) => {
    const raw = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const req = http.request({
      host: '127.0.0.1', port: proxyPort, method: 'POST',
      path: `http://127.0.0.1:${targetPort}${pathname}`,
      headers: { host: `127.0.0.1:${targetPort}`, 'content-type': 'application/json', 'content-length': raw.length },
    }, (res) => {
      const chunks=[]; res.on('data', c=>chunks.push(c)); res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(chunks).toString()}));
    });
    req.on('error', reject); req.end(raw);
  });
}

test('real proxy compresses OpenAI history before forwarding and preserves active turn', async () => {
  let received;
  const upstream = http.createServer((req,res) => {
    const chunks=[]; req.on('data',c=>chunks.push(c)); req.on('end',()=>{
      received=JSON.parse(Buffer.concat(chunks).toString());
      res.writeHead(200, {'content-type':'application/json'});
      res.end(JSON.stringify({ok:true}));
    });
  });
  const upstreamPort=await listen(upstream);

  process.env.PROXY_PORT='0';
  const proxy=require('../src/proxy');
  if (!proxy.listening) await new Promise(r=>proxy.once('listening',r));
  const proxyPort=proxy.address().port;

  const messages=[];
  for(let i=0;i<35;i++){messages.push({role:'user',content:'old-'+i+' '+ 'x'.repeat(1800)});messages.push({role:'assistant',content:'reply-'+i+' '+ 'y'.repeat(1800)});}
  messages.push({role:'user',content:'CURRENT-TURN-MUST-STAY-EXACT'});
  const originalSize=JSON.stringify(messages).length;

  const result=await requestViaProxy(proxyPort,upstreamPort,'/v1/chat/completions',{model:'test-model',messages});
  assert.equal(result.status,200);
  assert.ok(received);
  assert.equal(received.messages.at(-1).content,'CURRENT-TURN-MUST-STAY-EXACT');
  assert.ok(JSON.stringify(received.messages).length < originalSize / 2);

  await close(proxy); await close(upstream);
});
