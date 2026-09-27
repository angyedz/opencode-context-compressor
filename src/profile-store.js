'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const PROFILE_DIR = process.env.PROFILE_DIR || path.join(os.homedir(), '.context-compressor');
const PROFILE_FILE = process.env.PROFILE_FILE || path.join(PROFILE_DIR, 'profile.json');
const MAX_FACTS = 64;
const MAX_FACT_CHARS = 500;
const DEFAULT_SUMMARY_CHARS = 1400;

const ALLOWED_CATEGORIES = new Set([
  'preference',
  'workflow',
  'project',
  'communication',
  'environment',
  'other',
]);

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, MAX_FACT_CHARS);
}

function normalizeCategory(value) {
  const v = String(value || 'other').toLowerCase().trim();
  return ALLOWED_CATEGORIES.has(v) ? v : 'other';
}

class ProfileStore {
  constructor() {
    this._facts = [];
    this._load();
  }

  _load() {
    try {
      if (!fs.existsSync(PROFILE_FILE)) return;
      const parsed = JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf8'));
      const facts = Array.isArray(parsed) ? parsed : parsed?.facts;
      if (!Array.isArray(facts)) return;
      this._facts = facts
        .filter((f) => f && typeof f.text === 'string')
        .map((f) => ({
          id: String(f.id || ''),
          category: normalizeCategory(f.category),
          text: normalizeText(f.text),
          createdAt: Number(f.createdAt) || Date.now(),
          updatedAt: Number(f.updatedAt) || Number(f.createdAt) || Date.now(),
        }))
        .filter((f) => f.text)
        .slice(-MAX_FACTS);
    } catch (_) {
      this._facts = [];
    }
  }

  _save() {
    fs.mkdirSync(PROFILE_DIR, { recursive: true, mode: 0o700 });
    const payload = JSON.stringify({ version: 1, facts: this._facts }, null, 2);
    fs.writeFileSync(PROFILE_FILE, payload, { encoding: 'utf8', mode: 0o600 });
    try { fs.chmodSync(PROFILE_FILE, 0o600); } catch (_) {}
  }

  remember(note, category = 'other') {
    const text = normalizeText(note);
    if (!text) return { saved: false, reason: 'empty' };

    const normalized = text.toLowerCase();
    const existing = this._facts.find((f) => f.text.toLowerCase() === normalized);
    if (existing) {
      existing.category = normalizeCategory(category);
      existing.updatedAt = Date.now();
      this._save();
      return { saved: true, updated: true, fact: { ...existing } };
    }

    const now = Date.now();
    const fact = {
      id: `fact-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      category: normalizeCategory(category),
      text,
      createdAt: now,
      updatedAt: now,
    };

    this._facts.push(fact);
    if (this._facts.length > MAX_FACTS) {
      this._facts = this._facts.slice(-MAX_FACTS);
    }
    this._save();
    return { saved: true, updated: false, fact: { ...fact } };
  }

  forget(query) {
    const q = normalizeText(query).toLowerCase();
    if (!q) return 0;
    const before = this._facts.length;
    this._facts = this._facts.filter((f) => {
      return !f.id.toLowerCase().includes(q) && !f.text.toLowerCase().includes(q);
    });
    const removed = before - this._facts.length;
    if (removed > 0) this._save();
    return removed;
  }

  clear() {
    this._facts = [];
    this._save();
  }

  list(query = '') {
    this._load();
    const q = normalizeText(query).toLowerCase();
    const facts = q
      ? this._facts.filter((f) => `${f.category} ${f.text}`.toLowerCase().includes(q))
      : [...this._facts];
    return facts.map((f) => ({ ...f }));
  }

  summary(maxChars = DEFAULT_SUMMARY_CHARS) {
    const cap = Math.max(200, Number(maxChars) || DEFAULT_SUMMARY_CHARS);
    const facts = this.list();
    if (!facts.length) return '';

    const ordered = facts.sort((a, b) => {
      const prefA = a.category === 'preference' ? 1 : 0;
      const prefB = b.category === 'preference' ? 1 : 0;
      if (prefA !== prefB) return prefB - prefA;
      return b.updatedAt - a.updatedAt;
    });

    let out = '';
    for (const fact of ordered) {
      const line = `- [${fact.category}] ${fact.text}\n`;
      if (out.length + line.length > cap) break;
      out += line;
    }
    return out.trim();
  }

  stats() {
    this._load();
    return { facts: this._facts.length, file: PROFILE_FILE };
  }
}

module.exports = new ProfileStore();
module.exports.PROFILE_FILE = PROFILE_FILE;
