'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {StructuredPayloadVault,externalize,hydrate}=require('../src/context/structured-payload-vault');

test('tool-result image survives compaction vault round-trip byte-identically',()=>{
 const v=new StructuredPayloadVault();
 const original=[{type:'text',text:'screenshot'},{type:'image_url',image_url:{url:'data:image/png;base64,AAECAwQ='}}];
 const compact=externalize(original,v);
 assert.equal(compact[1].type,'context_payload_ref');
 assert.deepEqual(hydrate(compact,v),original);
});

test('payload vault remains memory bounded',()=>{
 const v=new StructuredPayloadVault({maxEntries:3,maxBytes:100000});
 for(let i=0;i<10;i++)v.put({type:'image',data:'data:image/png;base64,'+'A'.repeat(1000)+i});
 assert.ok(v.stats().entries<=3);assert.ok(v.stats().bytes<=100000);
});
