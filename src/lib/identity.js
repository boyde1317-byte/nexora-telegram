/**
 * identity.js — Human-readable identity resolution for display surfaces.
 *
 * WhatsApp now addresses many users by opaque LIDs (e.g. 47185047642176@lid),
 * which must never be shown to users as if they were phone numbers — a LID is
 * ~15-20 digits and looks like a number but is just an opaque account pointer.
 *
 * This helper turns a target JID (phone JID, LID JID, or device-suffixed
 * variant) into a display-safe identity:
 *
 *   { number: '233533416608' | null,   // real phone digits, null if unresolvable
 *     username: 'watss' | null,        // wa.me username, when the account has one
 *     label: '+233533416608' | '@watss' | 'hidden account' }
 *
 * Resolution order for LIDs:
 *   1. Group metadata bridge — participants carry `phoneNumber` (and often
 *      `lid`) attrs on the raw node, no session required. This resolves even
 *      brand-new LIDs, which is the common case in groups. Metadata is
 *      cached briefly so batch surfaces (tagall, leaderboards) don't hammer
 *      the socket with one fetch per member.
 *   2. LID → PN via sock.signalRepository.lidMapping (local, instant,
 *      populated from encrypted session state).
 *   3. Username via a USync query using the fork's username protocol
 *      (sock.executeUSyncQuery).
 *
 * Never throws — display code can call it blind.
 */

import { USyncQuery, USyncUser } from 'baileys';
import { resolvePhoneJid } from '../core/serializer.js';

const USERNAME_CACHE = new Map(); // phoneJid -> username | null
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12h — usernames rarely change
const GROUP_META_TTL = 30 * 1000;   // 30s — one metadata fetch serves a whole batch
const groupMetaCache = new Map();    // groupJid -> { meta, ts }

function stripDevice(jid) {
  if (!jid || typeof jid !== 'string') return '';
  const at = jid.lastIndexOf('@');
  // Strip a device suffix in EITHER position: "num:7@domain" (usual) or
  // "num@domain:7" (some event shapes). Without the domain-side strip,
  // "233@s.whatsapp.net:7" fails the endsWith('@s.whatsapp.net') gate and
  // real phone numbers resolved as "hidden account (LID)".
  const domain = at !== -1 ? jid.slice(at).replace(/:\d+$/, '') : '';
  const user = (at !== -1 ? jid.slice(0, at) : jid).split(':')[0].replace(/\.\d+$/, '');
  return domain ? user + domain : user;
}

/** Cached group metadata fetch — a batch of LID lookups costs one call. */
async function getGroupMeta(sock, groupJid) {
  if (!sock?.groupMetadata || !groupJid || !String(groupJid).endsWith('@g.us')) return null;
  const cached = groupMetaCache.get(groupJid);
  if (cached && Date.now() - cached.ts < GROUP_META_TTL) return cached.meta;
  try {
    const meta = await sock.groupMetadata(groupJid);
    groupMetaCache.set(groupJid, { meta, ts: Date.now() });
    return meta;
  } catch (_) {
    return null;
  }
}

/** Match a (possibly device-suffixed) participant id/lid attr against a bare JID. */
function participantMatches(p, bare) {
  return stripDevice(p?.id) === bare || stripDevice(p?.lid) === bare;
}

/**
 * Group-metadata bridge: find a participant node for `bare` and pull its
 * phoneNumber / notify attrs. Works for LIDs with no Signal session yet.
 * Returns { phoneNumber, notify } with nulls when absent.
 */
async function groupBridge(sock, bare, groupJid) {
  if (!groupJid) return { phoneNumber: null, notify: null };
  const meta = await getGroupMeta(sock, groupJid);
  const p = meta?.participants?.find(part => participantMatches(part, bare));
  return {
    phoneNumber: p?.phoneNumber ? String(p.phoneNumber).replace(/[^0-9]/g, '') : null,
    notify: p?.notify || p?.name || p?.pushName || null,
  };
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
  if (cached !== undefined && cached !== null && Date.now() - cached.ts < CACHE_TTL) return cached.value;
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
 * @param {object} sock   Baileys socket
 * @param {string} jid    target JID (may be @lid or device-suffixed)
 * @param {string} [groupJid]  group JID when known — enables the metadata bridge
 * @returns {Promise<{number: string|null, username: string|null, label: string, phoneJid: string|null, pushName: string|null}>}
 */
export async function resolveDisplayIdentity(sock, jid, groupJid = null) {
  let number = null;
  let phoneJid = null;
  let username = null;
  let pushName = null;

  try {
    const norm = stripDevice(jid);
    if (!norm) return { number, username, label: 'unknown', phoneJid, pushName };

    if (norm.endsWith('@lid')) {
      // 1. group metadata bridge (works without a session)
      const bridged = await groupBridge(sock, norm, groupJid);
      pushName = bridged.notify;
      if (bridged.phoneNumber) {
        number = bridged.phoneNumber;
        phoneJid = `${number}@s.whatsapp.net`;
      } else {
        // 2. signal repository mapping
        const resolved = await resolvePhoneJid(sock, norm);
        const local = resolved.split('@')[0];
        if (resolved.endsWith('@s.whatsapp.net') && /^\d+$/.test(local)) {
          number = local;
          phoneJid = resolved;
        }
      }
    } else {
      const local = norm.split('@')[0];
      if (norm.endsWith('@s.whatsapp.net') && /^\d+$/.test(local)) {
        number = local;
        phoneJid = norm;
      }
    }

    if (phoneJid) username = await fetchUsername(sock, phoneJid);
    if (!pushName) {
      try {
        const contact = await sock.onWhatsApp?.(phoneJid?.split('@')[0]);
        pushName = contact?.[0]?.notify || null;
      } catch (_) { /* optional */ }
    }
  } catch (_) {
    // never break a command over display resolution
  }

  let label;
  if (number && username) label = `@${username}`;        // username preferred when both exist
  else if (number) label = `+${number}`;
  else if (pushName) label = pushName;                    // a name beats opaque digits
  else label = 'hidden account';                          // never leak the LID digits

  return { number, username, label, phoneJid, pushName };
}

/**
 * Batch variant — resolves many JIDs against ONE group metadata fetch.
 * Returns a Map: original jid -> identity.
 */
export async function resolveManyIdentities(sock, jids, groupJid = null) {
  const out = new Map();
  const list = [...new Set(jids.filter(Boolean))];
  if (!list.length) return out;

  // Warm the metadata cache once, then per-jid resolution is free.
  await getGroupMeta(sock, groupJid);
  for (const jid of list) {
    out.set(jid, await resolveDisplayIdentity(sock, jid, groupJid));
  }
  return out;
}

/**
 * Mention-chip helper: visible chip text + the JID to put in `mentions`.
 * The chip label never contains raw LID digits; the mention JID uses the
 * resolved phone JID so the label and the notification target agree.
 *
 * @returns {Promise<{label: string, mentionJid: string}>}  label like "@233..." / "@username" / "@PushName"
 */
export async function mentionChip(sock, jid, groupJid = null) {
  const id = await resolveDisplayIdentity(sock, jid, groupJid);
  if (id.number) {
    const chip = id.username ? `@${id.username}` : `@${id.number}`;
    return { label: chip, mentionJid: id.phoneJid || jid };
  }
  if (id.pushName) return { label: `@${id.pushName}`, mentionJid: jid };
  return { label: '@member', mentionJid: jid };
}
