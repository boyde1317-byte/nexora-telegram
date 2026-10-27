/**
 * chatMemory.js — persistent rolling conversation memory for the
 * conversational AI commands (.simi, .feelbetter).
 *
 * Shared single source of truth so every persona remembers the same way:
 *   • File-backed (data/chatMemory.json) — survives restarts, unlike the
 *     old in-memory Maps that gave simi "the memory of a goldfish".
 *   • Rolling window: last N turns per user (default 12).
 *   • Idle TTL: a conversation goes quiet after NEXORA_MEMORY_TTL_MIN
 *     (default 30) minutes of silence, so a new topic starts fresh —
 *     memory, not hoarding.
 *   • Keyed per persona+user, so Simi and the healing listener don't
 *     bleed into each other.
 *   • User-visible text only (phone/username rules apply — never JIDs).
 */
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'chatMemory.json');
const MAX_TURNS = Math.max(2, parseInt(process.env.NEXORA_MEMORY_TURNS || '12', 10));
const TTL_MS = Math.max(1, parseInt(process.env.NEXORA_MEMORY_TTL_MIN || '30', 10)) * 60_000;

/** key → [{ role: 'user'|'assistant', text, ts }] */
let store = {};
let saveTimer = null;

function load() {
  try {
    if (fs.existsSync(FILE)) store = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
  } catch (_) { store = {}; }
}

function persistSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(FILE + '.tmp', JSON.stringify(store), 'utf-8');
      fs.renameSync(FILE + '.tmp', FILE);
    } catch (err) { console.error('[chatMemory] persist failed:', err.message); }
  }, 800);
}

function fresh(key) {
  const turns = store[key] || [];
  if (!turns.length) return [];
  // Idle TTL: drop the thread once it has gone quiet
  if (Date.now() - (turns[turns.length - 1]?.ts || 0) > TTL_MS) {
    store[key] = []; persistSoon(); // expired — start fresh on disk too
    return [];
  }
  return turns;
}

/**
 * Get the live turns for a persona+user key.
 * @returns {{role:'user'|'assistant', text:string}[]}
 */
export function getHistory(key) {
  return fresh(key);
}

/** Append one turn (role: 'user' | 'assistant'). Prunes to the window. */
export function pushTurn(key, role, text) {
  if (!key || !text) return;
  if (!store[key] || !fresh(key).length) store[key] = [];
  store[key].push({ role, text: String(text), ts: Date.now() });
  if (store[key].length > MAX_TURNS) store[key] = store[key].slice(-MAX_TURNS);
  persistSoon();
}

/** Wipe a persona+user thread (`.simi reset`). */
export function forget(key) {
  if (store[key]) { delete store[key]; persistSoon(); }
}

/** Gemini-API `contents` shape from the stored history + a new user turn. */
export function geminiContents(key, newText) {
  const turns = fresh(key);
  const contents = turns.map(t => ({
    role: t.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: t.text }],
  }));
  if (newText != null) contents.push({ role: 'user', parts: [{ text: newText }] });
  return contents;
}

load();
export default { getHistory, pushTurn, forget, geminiContents, MAX_TURNS, TTL_MS };
