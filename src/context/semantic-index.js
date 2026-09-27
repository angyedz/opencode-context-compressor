'use strict';

const { estimateMessagesTokens } = require('./token-budget');
const { factEntities } = require('./semantic-graph');
const { stableFingerprint } = require('./tool-compactor');

function extractText(content){
  if(typeof content==='string') return content;
  if(Array.isArray(content)) return content.map(extractText).filter(Boolean).join('\n');
  if(content&&typeof content==='object'){
    if(typeof content.text==='string') return content.text;
    if(content.content!==undefined) return extractText(content.content);
  }
  return '';
}

function lexicalTokens(text){
  return new Set((String(text||'').toLowerCase().match(/[a-z0-9_./:-]{4,}/g)||[]).slice(0,512));
}

function turnText(turn){
  return (turn||[]).map(m=>extractText(m?.content)).filter(Boolean).join('\n');
}

function indexTurn(turn,index){
  const text=turnText(turn);
  let chars=0;
  try{chars=JSON.stringify(turn).length;}catch(_){chars=text.length;}
  const entities=factEntities(text);
  const roles=[...new Set((turn||[]).map(m=>m?.role).filter(Boolean))];
  return {
    index,
    turn,
    text,
    chars,
    tokens:estimateMessagesTokens(turn),
    entities,
    lexical:lexicalTokens(text),
    roles,
    fingerprint:stableFingerprint(text),
    structured:(turn||[]).some(m=>Array.isArray(m?.content)&&m.content.some(p=>p&&typeof p==='object'&&p.type&&p.type!=='text')),
    toolHeavy:(turn||[]).filter(m=>m?.role==='tool'||m?.tool_calls||m?.function_call).length/Math.max(1,(turn||[]).length),
  };
}

function buildSemanticIndex(turns){
  return (turns||[]).map((turn,index)=>indexTurn(turn,index));
}

function overlapCount(a,b){
  let count=0;
  for(const value of a||[]) if(b.has(value)) count++;
  return count;
}

function querySemanticIndex(index,query,{limit=8,maxChars=Infinity,maxTokens=Infinity}={}){
  const queryEntities=new Set(factEntities(query));
  const queryLexical=lexicalTokens(query);
  const scored=[];
  for(const item of index||[]){
    const entityOverlap=item.entities.filter(e=>queryEntities.has(e)).length;
    const lexicalOverlap=overlapCount(item.lexical,queryLexical);
    if(!entityOverlap&&!lexicalOverlap) continue;
    const recency=item.index/Math.max(1,(index||[]).length-1);
    const score=entityOverlap*10+lexicalOverlap*2+recency;
    scored.push({...item,score,entityOverlap,lexicalOverlap});
  }
  scored.sort((a,b)=>b.score-a.score||b.index-a.index);
  const out=[]; let chars=0,tokens=0;
  for(const item of scored){
    if(out.length>=limit) break;
    if(chars+item.chars>maxChars||tokens+item.tokens>maxTokens) continue;
    out.push(item); chars+=item.chars; tokens+=item.tokens;
  }
  return out;
}

function indexStats(index){
  const rows=index||[];
  return {
    turns:rows.length,
    chars:rows.reduce((s,x)=>s+x.chars,0),
    tokens:rows.reduce((s,x)=>s+x.tokens,0),
    structuredTurns:rows.filter(x=>x.structured).length,
    averageToolDensity:rows.length?rows.reduce((s,x)=>s+x.toolHeavy,0)/rows.length:0,
    uniqueEntities:new Set(rows.flatMap(x=>x.entities)).size,
  };
}

module.exports={
  extractText,
  lexicalTokens,
  turnText,
  indexTurn,
  buildSemanticIndex,
  querySemanticIndex,
  indexStats,
};
