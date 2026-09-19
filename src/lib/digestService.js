/**
 * @file src/lib/digestService.js
 *
 * Daily fact digest — .subscribe / .unsubscribe manage subscribers
 * (db.data.digest.subscribers: jid → { chat: lastSentDate }). The boot
 * hook initDigestService() (server.js, next to initReminderService)
 * checks every 5 minutes: for each subscriber whose chat hasn't gotten
 * today's digest and local time is past 08:00, fetch a fresh fact
 * (uselessfacts.jsph.pl — same API as .fact, 8s timeout + 1 retry,
 * curated fallback so delivery never silently dies) and deliver a
 * mixed card with native actions.
 *
 * Delivery is once per chat per day, so volume is trivial — no pacing
 * needed. Restart-safe: lastSentDate lives in db, so a boot after 08:00
 * still delivers today's digest (same late-delivery contract as the
 * reminder service).
 */
import { db } from '../database/db.js';
import { client } from '../core/client.js';
import { mixedCard } from './interactiveKit.js';

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const DELIVER_HOUR       = 8;   // 08:00 server-local time
const FALLBACK_FACTS = [
  'Honey never spoils — 3,000-year-old jars found in Egyptian tombs were still edible.',
  'Octopuses have three hearts, and two of them stop beating when they swim.',
  'Bananas are berries, but strawberries are not.',
  'A day on Venus is longer than a year on Venus.',
  'The first computer bug was an actual moth, taped into a logbook in 1947.',
  'Sharks existed before trees — by about 50 million years.',
  'The Eiffel Tower grows about 15 cm taller in summer due to thermal expansion.',
  'Wombat poop is cube-shaped so it does not roll away.',
];

if (!db.data.digest) db.data.digest = { subscribers: {} };

const todayStr = () => new Date().toISOString().slice(0, 10);

export function getSubscribers() {
  return db.data.digest.subscribers;
}

export async function fetchFact() {
  try {
    const res = await Promise.race([
      fetch('https://uselessfacts.jsph.pl/api/v2/facts/random'),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
    ]);
    if (!res.ok) throw new Error('API ' + res.status);
    const data = await res.json();
    if (data?.text) return data.text;
    throw new Error('empty');
  } catch (_) {
    // one retry, then curated fallback — the digest must always deliver
    try {
      const res = await fetch('https://uselessfacts.jsph.pl/api/v2/facts/random');
      if (res.ok) {
        const data = await res.json();
        if (data?.text) return data.text;
      }
    } catch (_) {}
    return FALLBACK_FACTS[Math.floor(Math.random() * FALLBACK_FACTS.length)];
  }
}

async function deliverDigest(jid) {
  const sock = client.socket;
  if (!sock?.sendMessage) return false;
  const fact = await fetchFact();
  const body = `✦ *DAILY DIGEST* ✦\n\n🧠 ${fact}\n\n_To stop these, send_ _.unsubscribe_`;
  try {
    await mixedCard(sock, jid, {
      text: body,
      footer: 'NEXORA • Daily Digest',
    }, [
      { kind: 'action', label: '🔄 Another Fact', cmd: '.fact' },
      { kind: 'action', label: '❌ Unsubscribe',  cmd: '.unsubscribe' },
    ]);
    return true;
  } catch (_) {
    try {
      await sock.sendMessage(jid, { text: body });
      return true;
    } catch (_) {
      return false; // dead chat — keep subscriber, try again tomorrow
    }
  }
}

async function sweep() {
  try {
    const now = new Date();
    if (now.getHours() < DELIVER_HOUR) return;          // not 08:00 yet
    const today = todayStr();
    for (const [jid, sub] of Object.entries(db.data.digest.subscribers)) {
      if (sub.lastSentDate === today) continue;          // already delivered
      const ok = await deliverDigest(jid);
      if (ok) {
        sub.lastSentDate = today;
        try { db.save(); } catch (_) {}
        await new Promise(r => setTimeout(r, 2000));      // gentle between chats
      }
    }
  } catch (err) {
    console.warn('[DIGEST] sweep failed:', err.message || err);
  }
}

export function initDigestService() {
  console.log('[DIGEST] service armed (daily 08:00 local, 5-min checks)');
  setInterval(sweep, CHECK_INTERVAL_MS);
  sweep().catch(() => {}); // boot sweep — late digest on restart after 08:00
}

export default { initDigestService, getSubscribers, fetchFact };
