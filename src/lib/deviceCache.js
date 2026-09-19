/**
 * deviceCache.js — per-sender last-seen device metadata.
 *
 * WhatsApp encodes useful device info in every message; this cache keeps
 * the last one seen per sender so .device can report it later:
 *
 *   - device index  — the ':N' suffix on the raw participant JID.
 *     0 = the primary phone; N>0 = one of the account's linked devices
 *     (WhatsApp Web / Desktop / a linked-bot bridge such as a Baileys
 *     bot — they ALL connect as "linked devices").
 *   - msg id        — the first bytes of key.id identify the sending app
 *     family (official apps share the 3EB0.. base; we surface the prefix
 *     as a hint, never a verdict).
 *   - sender-key / deviceListMetadata presence — whether the message
 *     arrived sender-key encrypted (modern official app sessions).
 *
 * Everything here is OBSERVED from real traffic, not guessed.
 */
const CACHE = new Map(); // jid (normalized, no device suffix) -> entry
const MAX = 2000;

/** Parse the device index out of a raw JID ('…:3@s.whatsapp.net' -> 3). */
export function deviceIndexOf(rawJid) {
  const m = rawJid?.match(/:(\d+)@/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Record the latest raw message for its sender. Call AFTER serialize
 * succeeds — takes the RAW message, since the serializer normalizes the
 * device suffix away.
 */
export function rememberDevice(rawMessage) {
  try {
    const key = rawMessage?.key;
    if (!key?.remoteJid) return;
    const rawJid = key.participant || (key.fromMe ? rawMessage.sock?.user?.id : '') || key.remoteJid;
    if (!rawJid || !rawJid.includes('@')) return;
    const norm = rawJid.split(':')[0] + (rawJid.includes('@lid') ? '@lid' : '@s.whatsapp.net');
    const msg = rawMessage.message || {};

    CACHE.set(norm, {
      rawJid,
      deviceIndex: deviceIndexOf(rawJid),
      msgId: key.id || '',
      msgIdPrefix: (key.id || '').slice(0, 6),
      hasSenderKey: !!msg.senderKeyDistributionMessage,
      hasDeviceListMeta: !!(msg.messageContextInfo?.deviceListMetadata
        || msg.senderKeyDistributionMessage?.messageContextInfo?.deviceListMetadata),
      pushName: rawMessage.pushName || '',
      lastType: Object.keys(msg)[0] || '',
      ts: Date.now(),
    });

    if (CACHE.size > MAX) {
      const oldest = CACHE.keys().next().value;
      CACHE.delete(oldest);
    }
  } catch (_) { /* never break the pipeline over bookkeeping */ }
}

/** Get the cached entry for a sender JID (device suffix ignored). */
export function getDeviceInfo(jid) {
  return CACHE.get(jid) || null;
}

/** How long ago the sender was last seen (ms), or null. */
export function lastSeenAgo(jid) {
  const e = CACHE.get(jid);
  return e ? Date.now() - e.ts : null;
}
