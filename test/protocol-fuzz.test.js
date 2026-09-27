'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {compressMessages}=require('../src/compressor');
const protocol=require('../src/context/protocol-integrity');

function rng(seed){
  let x=seed>>>0;
  return ()=>((x=(1664525*x+1013904223)>>>0)/0x100000000);
}

function openaiSession(seed){
  const random=rng(seed); const messages=[];
  for(let i=0;i<18;i++){
    messages.push({role:'user',content:`task ${i} src/m${i%4}.js`});
    if(random()<0.7){
      const id=`call-${seed}-${i}`;
      messages.push({role:'assistant',content:'',tool_calls:[{id,type:'function',function:{name:'read_file',arguments:JSON.stringify({path:`src/m${i%4}.js`})}}]});
      messages.push({role:'tool',tool_call_id:id,name:'read_file',content:'line\n'.repeat(50)+`RESULT ${i}`});
    }
    messages.push({role:'assistant',content:`Decision: src/m${i%4}.js API contract must stay compatible.`});
  }
  messages.push({role:'user',content:`CURRENT-OPENAI-${seed}`});
  return messages;
}

function anthropicSession(seed){
  const messages=[];
  for(let i=0;i<14;i++){
    messages.push({role:'user',content:[{type:'text',text:`inspect src/a${i%3}.js`}]});
    const id=`toolu_${seed}_${i}`;
    messages.push({role:'assistant',content:[{type:'tool_use',id,name:'read_file',input:{path:`src/a${i%3}.js`}}]});
    messages.push({role:'user',content:[{type:'tool_result',tool_use_id:id,content:'ok '+ 'x'.repeat(120)}]});
    messages.push({role:'assistant',content:[{type:'text',text:`Decision: src/a${i%3}.js signature must remain stable.`}]});
  }
  messages.push({role:'user',content:[{type:'text',text:`CURRENT-ANTHROPIC-${seed}`}]});
  return messages;
}

function geminiSession(seed){
  const messages=[];
  for(let i=0;i<14;i++){
    messages.push({role:'user',content:[{text:`inspect src/g${i%3}.js`}]});
    messages.push({role:'assistant',content:[{functionCall:{name:'read_file',args:{path:`src/g${i%3}.js`}}}]});
    messages.push({role:'user',content:[{functionResponse:{name:'read_file',response:{result:'ok '+i}}}]});
    messages.push({role:'assistant',content:[{text:`Decision: src/g${i%3}.js API must remain compatible.`}]});
  }
  messages.push({role:'user',content:[{text:`CURRENT-GEMINI-${seed}`}]});
  return messages;
}

for(const [name,factory] of Object.entries({openai:openaiSession,anthropic:anthropicSession,gemini:geminiSession})){
  test(`protocol fuzz: ${name} remains valid and deterministic`,()=>{
    for(let seed=1;seed<=30;seed++){
      const input=factory(seed);
      const snapshot=JSON.stringify(input);
      const out=compressMessages(input,{maxChars:5000+(seed%4)*1200});
      const again=compressMessages(input,{maxChars:5000+(seed%4)*1200});
      assert.equal(JSON.stringify(input),snapshot,`${name} input mutated seed ${seed}`);
      assert.deepEqual(again,out,`${name} nondeterministic seed ${seed}`);
      assert.equal(protocol.validateToolProtocol(out).valid,true,`${name} protocol invalid seed ${seed}`);
      const last=out[out.length-1];
      assert.deepEqual(last,input[input.length-1],`${name} current turn changed seed ${seed}`);
    }
  });
}
