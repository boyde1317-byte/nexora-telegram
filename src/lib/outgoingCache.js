/**
 * @file src/lib/outgoingCache.js
 *
 * Tracks the message IDs of everything the bot sends, per chat, so
 * `.delall` can sweep them later. The in-memory messageStore in
 * connection.js only caches INCOMING messages (for getMessage retries);
 * it never sees our own sends — and rich sends ride sock.relayMessage
 * (prepared protos), which don't flow through sock.sendMessage at all.
 *
 * So both send surfaces get a transparent wrapper (attachOutgoingTracker):
 *   • sock.sendMessage → record the returned WAMessage's key.id
 *   • sock.relayMessage → record options.messageId (baileysBridge always
 *     passes it; it is the same id generateWAMessageFromContent put in the
 *     proto's key)
 *
 * Skipped on purpose: { delete } protocol sends and { react } reactions —
 * deleting those later is a pointless no-op that only pads the cache.
 *
 * Cache shape: Map<jid, [{ id, ts }]> — capped at 300 ids per chat and
 * 50 tracked chats, oldest evicted first. Pure in-memory: a restart
 * clears it, which is fine — .delall is housekeeping for recent spam,
 * not an archival delete.
 */

const MAX_PER_CHAT  = 300;
const MAX_CHATS    = 50;
const TTL_MS       = 7 * 24 * 60 * 60 * 1000; // 7 days

const cache = new Map();

function evictStale(jid) {
  const list = cache.get(jid);
  if (!list) return;
  const cutoff = Date.now() - TTL_MS;
  while (list.length && list[0].ts < cutoff) list.shift();
  if (!list.length) cache.delete(jid);
}

/**
 * Record one outgoing message id for a chat.
 */
export function recordOutgoing(jid, id) {
  if (!jid || !id) return;
  if (typeof jid !== 'string' || jid === '@s.whatsapp.net') return;
  if (!cache.has(jid)) {
    // Evict the stalest chat when we exceed the tracked-chat cap
    if (cache.size >= MAX_CHATS) {
      let oldestJid = null;
      let oldestTs = Infinity;
      for (const [j, list] of cache) {
        const ts = list.length ? Math.min(...list.map(e => e.ts)) : Infinity;
        if (ts < oldestTs) { oldestTs = ts; oldestJid = j; }
      }
      if (oldestJid) cache.delete(oldestJid);
    }
    cache.set(jid, []);
  }
  const list = cache.get(jid);
  list.push({ id, ts: Date.now() });
  if (list.length > MAX_PER_CHAT) list.splice(0, list.length - MAX_PER_CHAT);
}

/**
 * Snapshot the deletable keys for a chat (oldest first, stale entries gone).
 * Keys are returned in WhatsApp delete shape: { remoteJid, fromMe: true, id }.
 */
export function getOutgoingKeys(jid) {
  evictStale(jid);
  const list = cache.get(jid) || [];
  return list.map(e => ({ remoteJid: jid, fromMe: true, id: e.id }));
}

/**
 * Drop recorded ids that were deleted (so a later .delall doesn't re-fire them).
 */
export function dropOutgoing(jid, ids) {
  const set = new Set(ids);
  const list = cache.get(jid);
  if (!list) return;
  cache.set(jid, list.filter(e => !set.has(e.id)));
}

/**
 * Wrap a socket's send surfaces so every outgoing message is recorded.
 * Call once per socket, right after creation (main + paired sessions).
 */
export function attachOutgoingTracker(sock) {
  if (!sock || sock._nexoraOutgoingTracked) return sock;
  try {
    const origSend = sock.sendMessage.bind(sock);
    sock.sendMessage = async (jid, content, options) => {
      const res = await origSend(jid, content, options);
      try {
        const skip = content && typeof content === 'object' && (content.delete || content.react);
        if (!skip && res?.key?.id) recordOutgoing(res.key.remoteJid || jid, res.key.id);
      } catch (_) { /* tracking must never break a send */ }
      return res;
    };
    const origRelay = sock.relayMessage?.bind(sock);
    if (origRelay) {
      sock.relayMessage = async (jid, content, options) => {
        try {
          if (options?.messageId) recordOutgoing(jid, options.messageId);
        } catch (_) { /* tracking must never break a relay */ }
        return await origRelay(jid, content, options);
      };
    }
    sock._nexoraOutgoingTracked = true;
  } catch (err) {
    console.warn('[OUTGOING] tracker attach failed:', err.message || err);
  }
  return sock;
}

export default { recordOutgoing, getOutgoingKeys, dropOutgoing, attachOutgoingTracker };
