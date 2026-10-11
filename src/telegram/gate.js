/**
 * gate.js — Community gate for self-service pairing.
 *
 * Any user may pair their own number without admin approval, provided the
 * WhatsApp number behind the request has:
 *   1. JOINED the NEXORA support group  (chat.whatsapp.com/GUgEw0Nd6CeEEmX7AQwnoQ)
 *   2. FOLLOWED the NEXORA channel      (whatsapp.com/channel/0029Vb7eSHf42Dcmdd3XA326)
 *
 * Checks run through any live session socket that can see the group/channel
 * (the main owner session first, then linked extras). If a check cannot be
 * executed at all (no session online, API restriction) it reports `null`
 * instead of false so the caller can decide policy — the group check stays
 * a hard requirement; the channel check degrades to advisory only when
 * WhatsApp declines to hand back a subscriber list.
 *
 * Admins keep their direct-pair bypass everywhere else in the panel
 * (see /pair in telegram/index.js) — admin gating is untouched.
 */

import { client } from '../core/client.js';
import { activeSessionSockets } from '../core/sessionManager.js';

export const SUPPORT_GROUP_LINK = 'https://chat.whatsapp.com/GUgEw0Nd6CeEEmX7AQwnoQ';
const SUPPORT_GROUP_INVITE_CODE = 'GUgEw0Nd6CeEEmX7AQwnoQ';
export const CHANNEL_LINK = 'https://whatsapp.com/channel/0029Vb7eSHf42Dcmdd3XA326';

/** Every socket that might see the group/channel: main first, then extras. */
function liveSocks() {
  const socks = [];
  if (client.socket?.user) socks.push(client.socket);
  for (const s of activeSessionSockets()) socks.push(s.sock);
  return socks;
}

/** Participant JID compare that tolerates device segments (`:7@s.w.net`). */
function jidPhone(jid) {
  return String(jid || '').split('@')[0].split(':')[0];
}

/** Deep-walk a raw WAMex response collecting s.whatsapp.net JIDs. */
function deepCollectJids(value, out = [], depth = 0) {
  if (!value || depth > 8) return out;
  if (typeof value === 'string') {
    if (value.includes('@s.whatsapp.net') || value.includes('@c.us')) out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const v of value) deepCollectJids(v, out, depth + 1);
    return out;
  }
  if (typeof value === 'object') {
    for (const v of Object.values(value)) deepCollectJids(v, out, depth + 1);
  }
  return out;
}

let groupJidCache = null;

async function resolveGroupJid(sock) {
  if (groupJidCache) return groupJidCache;
  const meta = await sock.groupGetInviteInfo(SUPPORT_GROUP_INVITE_CODE);
  const jid = meta?.id || meta?.jid;
  if (!jid) throw new Error('invite info returned no group JID');
  groupJidCache = jid;
  return jid;
}

/**
 * Has this phone joined the support group?
 * → { ok: true|false, group } on a decisive answer, { ok: null, error } when
 *   no online session could read the group.
 */
export async function checkGroupMembership(phone) {
  let lastError = null;
  for (const sock of liveSocks()) {
    try {
      const gid = await resolveGroupJid(sock);
      const meta = await sock.groupMetadata(gid);
      const members = meta?.participants || [];
      if (!members.length) continue; // this sock can't really see the group
      const hit = members.some((p) => jidPhone(p.id) === phone);
      return { ok: hit, group: meta.subject || 'support group' };
    } catch (err) {
      lastError = err?.message || String(err);
    }
  }
  return { ok: null, error: lastError || 'no live session could read the group' };
}

let channelJidCache = null;

async function resolveChannelJid(sock) {
  if (channelJidCache) return channelJidCache;
  const resolved = await sock.newsletterResolve(CHANNEL_LINK);
  const jid = resolved?.jid;
  if (!jid) throw new Error('channel link could not be resolved');
  channelJidCache = jid;
  return jid;
}

/**
 * Has this phone followed the channel? Uses the WAMex subscribers query,
 * which WhatsApp serves to the channel owner — the linked owner session
 * qualifies. Returns:
 *   { ok: true }  — found in the subscriber list
 *   { ok: false } — full list retrieved, phone absent
 *   { ok: null }  — list unavailable/partial → caller degrades to advisory
 */
export async function checkChannelFollow(phone) {
  for (const sock of liveSocks()) {
    try {
      const jid = await resolveChannelJid(sock);
      const raw = await sock.newsletterSubscribers(jid);
      const jids = deepCollectJids(raw);
      const unique = [...new Set(jids.map(jidPhone))];
      if (!unique.length) continue; // count-only response → try next socket
      const total = raw?.subscribers_count || raw?.data?.xwa2_newsletter_subscribers?.subscribers_count;
      // Partial page (list shorter than the real count): absence proves nothing
      if (total && unique.length < Number(total)) return { ok: null, partial: true };
      return { ok: unique.includes(phone), subscribers: total || unique.length };
    } catch (_) { /* try the next socket */ }
  }
  return { ok: null };
}

/**
 * Run the full gate for a phone number.
 * Returns { pass, groupOk, channelOk, note } — `pass` applies the policy:
 * group decisive-pass required; channel strict when verifiable, advisory
 * when WhatsApp won't share the list.
 */
export async function verifyPairingGate(phone) {
  const group = await checkGroupMembership(phone);
  // Hard requirement: a decisive group check
  if (group.ok === null) {
    return { pass: null, groupOk: null, channelOk: null,
      note: `could not verify group membership (${group.error})` };
  }
  if (!group.ok) {
    const channel = await checkChannelFollow(phone);
    return { pass: false, groupOk: false, channelOk: channel.ok === true, note: null };
  }
  const channel = await checkChannelFollow(phone);
  if (channel.ok === false) {
    return { pass: false, groupOk: true, channelOk: false, note: null };
  }
  return { pass: true, groupOk: true, channelOk: true,
    advisory: channel.ok === null, note: channel.partial ? 'partial subscriber page' : null };
}
