/**
 * identity.js — Human-readable identity resolution for display surfaces.
 *
 * WhatsApp now addresses many users by opaque LIDs (e.g. 47185047642176@lid),
 * which must never be shown to users as if they were phone numbers — a LID is
 * 20 digits and looks like a number but is just an opaque account pointer.
 *
 * This helper turns a target JID (phone JID, LID JID, or device-suffixed
 * variant) into a display-safe identity:
 *
 *   { number: '233533416608' | null,   // real phone digits, null if unresolvable
 *     username: 'watss' | null,        // wa.me username, when the account has one
 *     label: '+233533416608' | '@watss' | 'hidden account' }
 *
 * Resolution order:
 *   1. LID → PN via sock.signalRepository.lidMapping (local, instant,
 *      populated from encrypted session state).
 *   2. Username via a USync query using the fork's username protocol
 *      (sock.executeUSyncQuery is exposed by OURIN-baileys).
 *
 * Never throws — display code can call it blind.
 */

import { USyncQuery, USyncUser } from 'baileys';
import { resolvePhoneJid } from '../core/serializer.js';

const USERNAME_CACHE = new Map(); // phoneJid -> username | null
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12h — usernames rarely change

function stripDevice(jid) {
  if (!jid || typeof jid !== 'string') return '';
  const at = jid.lastIndexOf('@');
  const domain = at !== -1 ? jid.slice(at) : '';
  const user = (at !== -1 ? jid.slice(0, at) : jid).split(':')[0];
  return domain ? user + domain : user;
}

/**
 * Look up a user's wa.me username via USync (fork ships the username protocol).
 * Returns null when the user has no username or the query fails.
 */
export async function fetchUsername(sock, phoneJid) {
  if (!sock?.executeUSyncQuery || !phoneJid) return null;

  const norm = stripDevice(phoneJid);
  if (!norm.endsWith('@s.whatsapp.net')) return null;

  const cached = USERNAME_CACHE.get(norm);
  if (cached !== undefined && cached !== null) return cached.value;
  // negative results are also cached but with a shorter TTL handled below

  try {
    const query = new USyncQuery()
      .withUsernameProtocol()
      .withUser(new USyncUser().withId(norm));
    const result = await sock.executeUSyncQuery(query);
    const entry = result?.list?.find?.((u) => stripDevice(u.id) === norm) || result?.list?.[0];
    const username = entry?.username || null;

    USERNAME_CACHE.set(norm, { value: username, ts: Date.now() });
    return username;
  } catch (_) {
    return null;
  }
}

/**
 * Resolve a target JID to a display-safe identity.
 *
 * @param {object} sock  Baileys socket
 * @param {string} jid   target JID (may be @lid or device-suffixed)
 * @returns {Promise<{number: string|null, username: string|null, label: string, phoneJid: string|null}>}
 */
export async function resolveDisplayIdentity(sock, jid) {
  let number = null;
  let phoneJid = null;
  let username = null;

  try {
    const norm = stripDevice(jid);
    if (!norm) return { number, username, label: 'unknown', phoneJid };

    const resolved = norm.endsWith('@lid')
      ? await resolvePhoneJid(sock, norm)
      : norm;

    const local = resolved.split('@')[0];
    if (resolved.endsWith('@s.whatsapp.net') && /^\d+$/.test(local)) {
      number = local;
      phoneJid = resolved;
      username = await fetchUsername(sock, phoneJid);
    }
  } catch (_) {
    // never break a command over display resolution
  }

  let label;
  if (number && username) label = `@${username}`;        // username preferred when both exist
  else if (number) label = `+${number}`;
  else label = 'hidden account (LID)';                    // never leak the LID digits

  return { number, username, label, phoneJid };
}
