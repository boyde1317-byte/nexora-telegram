/**
 * reminderService.js — persisted reminders that survive restarts.
 *
 * Moonson's reference .reminder arms a bare setTimeout: every redeploy or
 * crash silently drops every pending reminder. Here reminders live in
 * db.data.reminders and a boot sweep re-arms the timers; anything that
 * came due while offline (≤24h ago) is delivered late with a "missed
 * while offline" note instead of vanishing.
 *
 * Caps: 10 active reminders per user, max 30 days ahead.
 */
import { withChannelPill } from './menuContext.js';
import { db } from '../database/db.js';

const MAX_PER_USER = 10;
const MAX_AHEAD_MS = 30 * 24 * 3600 * 1000;   // 30 days
const MISSED_WINDOW_MS = 24 * 3600 * 1000;    // deliver up to 24h late

const _timers = new Map(); // id → Timeout

function load() {
  if (!Array.isArray(db.data.reminders)) db.data.reminders = [];
  return db.data.reminders;
}
const save = () => db.save();

function newId() {
  return 'r' + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 5);
}

/** Grab the live socket lazily — timers can outlive reconnects. */
async function getSocket() {
  // Late import avoids a cycle at module-load time.
  const { client } = await import('../core/client.js');
  return client.socket;
}

async function fire(rem) {
  remove(rem.id, rem.jid);
  try {
    const sock = await getSocket();
    if (!sock) throw new Error('no active socket');
    const overdue = Date.now() - rem.triggerAt > 60000;
    const text =
      `⏰ *REMINDER*\n\n❯ ${rem.text}\n\n` +
      (overdue
        ? `_set ${formatDuration(Date.now() - rem.createdAt)} ago — I was offline when it came due, sorry for the delay_`
        : `_set ${formatDuration(Date.now() - rem.createdAt)} ago_`);
    await sock.sendMessage(rem.jid, {
      text,
      mentions: rem.jid.endsWith('@g.us') ? [] : [rem.jid],
      contextInfo: withChannelPill(),
    });
  } catch (err) {
    console.warn('[REMINDER] delivery failed, re-queuing:', err.message);
    // Put it back so the next boot sweep retries.
    load().push(rem);
    save();
  }
}

function arm(rem) {
  if (_timers.has(rem.id)) return;
  const delay = Math.max(rem.triggerAt - Date.now(), 0);
  const t = setTimeout(async () => {
    _timers.delete(rem.id);
    await fire(rem);
  }, delay);
  t.unref?.();
  _timers.set(rem.id, t);
}

export function formatDuration(ms) {
  if (ms < 0) ms = 0;
  const s = Math.round(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600),
        m = Math.floor((s % 3600) / 60), sec = s % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (!d && !h && sec) parts.push(`${sec}s`);
  return parts.join(' ') || '0s';
}

export function addReminder({ jid, text, triggerAt }) {
  const all = load();
  if (all.filter(r => r.jid === jid).length >= MAX_PER_USER)
    return { error: `You already have ${MAX_PER_USER} active reminders. Cancel one first with \`.remind list\`.` };
  const ahead = triggerAt - Date.now();
  if (ahead <= 0) return { error: 'That time is already in the past.' };
  if (ahead > MAX_AHEAD_MS) return { error: 'Reminders can be at most 30 days ahead.' };
  const rem = { id: newId(), jid, text: text.slice(0, 200), triggerAt, createdAt: Date.now() };
  all.push(rem);
  save();
  arm(rem);
  return { reminder: rem };
}

export function listReminders(jid) {
  return load().filter(r => r.jid === jid).sort((a, b) => a.triggerAt - b.triggerAt);
}

export function remove(id, jid) {
  const all = load();
  const i = all.findIndex(r => r.id === id && (!jid || r.jid === jid));
  if (i === -1) return false;
  const t = _timers.get(id);
  if (t) { clearTimeout(t); _timers.delete(id); }
  all.splice(i, 1);
  save();
  return true;
}

export function clearReminders(jid) {
  const all = load();
  const keep = [];
  let removed = 0;
  for (const r of all) {
    if (r.jid === jid) {
      const t = _timers.get(r.id);
      if (t) { clearTimeout(t); _timers.delete(r.id); }
      removed++;
    } else keep.push(r);
  }
  if (removed) { db.data.reminders = keep; save(); }
  return removed;
}

/**
 * Boot hook: re-arm pending reminders and deliver the ones that came due
 * while the process was down (within the 24h missed-window).
 */
export function initReminderService() {
  const all = load();
  const now = Date.now();
  const keep = [];
  let armed = 0, missed = 0, dropped = 0;
  for (const r of all) {
    const late = now - r.triggerAt;
    if (late > MISSED_WINDOW_MS) { dropped++; continue; }        // too old — drop
    keep.push(r);
    if (late > 0) {
      missed++;
      // Deliver slightly staggered so a big backlog doesn't burst.
      r.triggerAt = now + missed * 2000;
    }
    arm(r);
    armed++;
  }
  if (dropped || missed) { db.data.reminders = keep; save(); }
  console.log(`[REMINDER] boot sweep: ${armed} armed, ${missed} late deliveries queued, ${dropped} dropped as stale`);
  return { armed, missed, dropped };
}
