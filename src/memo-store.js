'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const uid = typeof process.getuid === 'function' ? process.getuid() : 'user';
const SESSION_DIR = process.env.SESSION_DIR || path.join(os.tmpdir(), `opencode-context-compressor-${uid}`);
const SESSION_FILE = process.env.SESSION_FILE || path.join(SESSION_DIR, 'active-sessions.json');
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 8 * 60 * 60 * 1000);
const MAX_SESSIONS = 8;
const MAX_ITEMS = 320;
const MAX_STORED_TEXT = 24000;
const MAX_RECALL = 6000;
const DEFAULT_RECALL = 1600;

function normalizeText(value) { return String(value || '').replace(/\u0000/g, '').trim(); }
function extractContentText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((part) => {
    if (typeof part === 'string') return part;
    if (!part || typeof part !== 'object') return '';
    if (typeof part.text === 'string') return part.text;
    if (typeof part.content === 'string') return part.content;
    if (part.type === 'tool_use') return `[tool_use ${part.name || 'tool'}] ${JSON.stringify(part.input || {})}`;
    if (part.type === 'tool_result') return `[tool_result ${part.tool_use_id || ''}] ${extractContentText(part.content)}`;
    if (part.functionCall) return `[functionCall ${part.functionCall.name || 'function'}] ${JSON.stringify(part.functionCall.args || {})}`;
    if (part.functionResponse) return `[functionResponse ${part.functionResponse.name || 'function'}] ${JSON.stringify(part.functionResponse.response || {})}`;
    return '';
  }).filter(Boolean).join('\n');
  if (content && typeof content === 'object') return typeof content.text === 'string' ? content.text : (typeof content.content === 'string' ? content.content : '');
  return '';
}
function messageToMemoText(message) {
  let text = extractContentText(message?.content);
  if (Array.isArray(message?.tool_calls)) text = [text, ...message.tool_calls.map((call) => {
    const fn = call?.function || {};
    return `[tool_call ${fn.name || call?.type || 'tool'} id=${call?.id || ''}] ${fn.arguments || ''}`;
  })].filter(Boolean).join('\n');
  if (message?.function_call) text += `\n[function_call ${message.function_call.name || 'function'}] ${message.function_call.arguments || ''}`;
  return normalizeText(text).slice(0, MAX_STORED_TEXT);
}
function isControlCommand(text) { return /^(?:\$|\/)(?:context-compressor|compressor|model-memo|memo|history|search|remember|forget|profile|reset|help)\b/i.test(String(text || '').trim()); }
function formatAgo(timestamp) {
  const sec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60); return min < 60 ? `${min}m ago` : `${Math.floor(min / 60)}h ago`;
}
function formatTime(timestamp) { return new Date(timestamp).toISOString().slice(11, 19); }

class SessionMemoStore {
  constructor() { this._state = { version: 3, activeKey: null, sessions: {} }; this._load(); }
  _empty() { return { version: 3, activeKey: null, sessions: {} }; }
  _prune(state) {
    const now = Date.now();
    for (const [key, session] of Object.entries(state.sessions || {})) {
      if (!session?.updatedAt || now - session.updatedAt > SESSION_TTL_MS) delete state.sessions[key];
    }
    const ordered = Object.entries(state.sessions || {}).sort((a,b) => b[1].updatedAt - a[1].updatedAt);
    state.sessions = Object.fromEntries(ordered.slice(0, MAX_SESSIONS));
    if (!state.sessions[state.activeKey]) state.activeKey = ordered.find(([k]) => state.sessions[k])?.[0] || null;
    return state;
  }
  _load() {
    try {
      if (!fs.existsSync(SESSION_FILE)) return this._state = this._empty();
      const parsed = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
      if (parsed?.version === 3 && parsed.sessions) this._state = this._prune(parsed);
      else if (parsed?.key) this._state = this._prune({ version: 3, activeKey: parsed.key, sessions: { [parsed.key]: parsed } });
      else this._state = this._empty();
      this._save();
    } catch (_) { this._state = this._empty(); }
    return this._state;
  }
  _save() {
    this._prune(this._state);
    if (!Object.keys(this._state.sessions).length) { try { fs.unlinkSync(SESSION_FILE); } catch (_) {} return; }
    fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true, mode: 0o700 });
    fs.writeFileSync(SESSION_FILE, JSON.stringify(this._state), { encoding: 'utf8', mode: 0o600 });
    try { fs.chmodSync(SESSION_FILE, 0o600); } catch (_) {}
  }
  deriveSessionKey(rawMessages, metadata = {}) {
    if (metadata.sessionId) return `opencode:${String(metadata.sessionId).slice(0,160)}`;
    const firstUser = (Array.isArray(rawMessages) ? rawMessages : []).find((m) => m?.role === 'user' && messageToMemoText(m) && !isControlCommand(messageToMemoText(m)));
    if (!firstUser) return this.getActiveSessionKey() || 'default-active-session';
    const seed = messageToMemoText(firstUser).slice(0, 4000);
    return `session-${crypto.createHash('sha256').update(seed).digest('hex').slice(0,20)}`;
  }
  getActiveSessionKey() { return this._load().activeKey || null; }
  _filterMessages(rawMessages) {
    const out=[]; let skip=false;
    for (const message of Array.isArray(rawMessages) ? rawMessages : []) {
      const text=messageToMemoText(message);
      if (message?.role === 'user' && isControlCommand(text)) { skip=true; continue; }
      if (skip && message?.role === 'assistant') { skip=false; continue; }
      skip=false; if (message) out.push(message);
    }
    return out;
  }
  syncMessages(sessionKey, rawMessages) {
    if (!Array.isArray(rawMessages)) return;
    const state=this._load(); const key=sessionKey || this.deriveSessionKey(rawMessages);
    const previous=state.sessions[key]; const notes=(previous?.items || []).filter((i)=>i.type==='note');
    const items=[]; let step=0, substep=0;
    for (const message of this._filterMessages(rawMessages)) {
      if (!message?.role) continue;
      const text=messageToMemoText(message); const timestamp=Number(message.timestamp)||Date.now();
      if (message.role==='user') { step++; substep=0; items.push({type:'step',stepIndex:step,role:'user',text:text.slice(0,5000),timestamp}); }
      else if (message.role==='tool') { substep++; items.push({type:'substep',stepIndex:Math.max(step,1),substepIndex:substep,toolName:message.name||message.tool_name||'tool',text,timestamp}); }
      else if (message.role==='assistant') { const calls=Array.isArray(message.tool_calls)&&message.tool_calls.length; if(text||calls) items.push({type:calls?'assistant_tool':'step_reply',stepIndex:Math.max(step,1),role:'assistant',text,timestamp}); }
      else { substep++; items.push({type:'substep',stepIndex:Math.max(step,1),substepIndex:substep,toolName:message.role,text,timestamp}); }
    }
    state.sessions[key]={version:3,key,updatedAt:Date.now(),currentStep:step,items:[...items,...notes].slice(-MAX_ITEMS)};
    state.activeKey=key; this._state=state; this._save();
  }
  saveExplicit(sessionKey,note,category='session_note') {
    const state=this._load(); const key=sessionKey||state.activeKey||'default-active-session'; const text=normalizeText(note).slice(0,MAX_STORED_TEXT); if(!text)return;
    const base=state.sessions[key]||{version:3,key,updatedAt:Date.now(),currentStep:0,items:[]};
    base.items.push({type:'note',stepIndex:Math.max(1,base.currentStep||1),substepIndex:0,toolName:`note:${category}`,text,timestamp:Date.now()});
    base.items=base.items.slice(-MAX_ITEMS); base.updatedAt=Date.now(); state.sessions[key]=base; state.activeKey=key; this._state=state; this._save();
  }
  recall(sessionKey,query,maxChars) {
    const state=this._load(); const key=sessionKey||state.activeKey; const session=key&&state.sessions[key]; const cap=Math.min(Math.max(200,Number(maxChars)||DEFAULT_RECALL),MAX_RECALL);
    if(!session?.items?.length)return 'No active-session checkpoints are available.';
    const items=session.items; const q=String(query||'recent').toLowerCase().trim(); let matched=[];
    const step=q.match(/step\s*#?(\d+)/i), mins=q.match(/(\d+)\s*m(?:in|inutes)?/i);
    if(step) matched=items.filter(i=>i.stepIndex===Number(step[1]));
    else if(mins) { const cutoff=Date.now()-(Number(mins[1])*60000+30000); matched=items.filter(i=>i.timestamp>=cutoff); }
    else if(/\b(first|start|beginning|первый|первое|начало)\b/i.test(q)) matched=items.slice(0,12);
    else if(['recent','latest','all',''].includes(q)) matched=items.slice(-18);
    else { const tokens=q.split(/\s+/).filter(t=>t.length>1); matched=items.filter(i=>tokens.some(t=>`${i.text||''} ${i.toolName||''}`.toLowerCase().includes(t))).slice(-24); }
    if(!matched.length)return `No active-session checkpoints matching "${query}" found.`;
    let output=`# Active Session Timeline (query: "${query}")\n\n`;
    for(const item of matched){const time=`${formatTime(item.timestamp)} (${formatAgo(item.timestamp)})`; if(item.type==='step')output+=`[Step #${item.stepIndex} | ${time}] USER: ${item.text.slice(0,700)}\n`; else if(item.type==='step_reply'||item.type==='assistant_tool')output+=`[Step #${item.stepIndex} | ${time}] ASSISTANT: ${item.text.slice(0,900)}\n`; else output+=`  ↳ [Step #${item.stepIndex} | ${time}] ${item.toolName||item.type}: ${item.text.slice(0,1000)}\n`; if(output.length>=cap)break;}
    return output.slice(0,cap).trim();
  }
  clear(sessionKey) {
    const state=this._load(); const key=sessionKey||state.activeKey; if(!key)return; delete state.sessions[key]; if(state.activeKey===key)state.activeKey=null; this._state=state; this._save();
  }
  stats() { const state=this._load(); return {sessions:Object.keys(state.sessions).length,entries:Object.values(state.sessions).reduce((n,s)=>n+(s.items?.length||0),0),activeSession:state.activeKey,persistent:false,file:SESSION_FILE}; }
}
module.exports=new SessionMemoStore();
module.exports.SESSION_FILE=SESSION_FILE;
module.exports.extractContentText=extractContentText;
module.exports.messageToMemoText=messageToMemoText;
