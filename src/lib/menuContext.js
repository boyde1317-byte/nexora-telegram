/**
 * menuContext.js — reusable channel-pill + stacked contextInfo helpers.
 *
 * The channel pill is the small " forwarded from <channel> " banner at
 * the top of a message. It lives in contextInfo.forwardedNewsletterMessageInfo
 * and stacks cleanly with externalAdReply (bottom preview card) in a
 * single message — the Yuzuki-style stack: pill → preview card → media.
 *
 * The pill source is settings.channelId / settings.channelName, set by
 *   • .channel create   (auto-captured)
 *   • .setchannel <...@newsletter> / off
 *
 * Usage from any command:
 *   import { withChannelPill, getChannelPill } from '../lib/menuContext.js';
 *   await sock.sendMessage(jid, { image, caption, contextInfo: withChannelPill() });
 */
import { db } from '../database/db.js';

/** Newsletter JIDs look like 0029Vb7eSHf42Dcmdd3XA326@newsletter (alphanumeric). */
const CHANNEL_JID_RE = /^[\w-]+@newsletter$/;

// Default "view" channel pill — used when no channel has been configured
// (.channel create / .setchannel). Override or clear via env:
//   DEFAULT_CHANNEL_JID / DEFAULT_CHANNEL_NAME
const DEFAULT_CHANNEL_JID  = process.env.DEFAULT_CHANNEL_JID  || '120363406397452589@newsletter';
const DEFAULT_CHANNEL_NAME = process.env.DEFAULT_CHANNEL_NAME || 'NEXORA Updates';
export const isChannelJid = (jid) => CHANNEL_JID_RE.test(String(jid || ''));

/**
 * Build the forwardedNewsletterMessageInfo block, or null when no
 * channel is configured. serverMessageId is a number (some clients
 * ignore the pill entirely when it is null).
 */
export function getChannelPill() {
  const s = db.getSettings?.() || {};

  // .setchannel off disables the pill entirely (including the default)
  if (s.channelPillOff) return null;

  // Configured channel wins; otherwise fall back to the default
  // view channel (DEFAULT_CHANNEL_JID), overridable via env.
  const jid  = (isChannelJid(s.channelId) && s.channelId) || DEFAULT_CHANNEL_JID;
  const name = (isChannelJid(s.channelId) ? s.channelName : null) || DEFAULT_CHANNEL_NAME;
  if (!isChannelJid(jid)) return null;
  return {
    // forwardingScore + isForwarded make clients treat the message as a
    // forward, which is what turns the newsletter info into the rendered
    // " forwarded from <Channel> " header with the tappable "View channel"
    // pill. Without them many clients ignore the newsletter block.
    forwardingScore: 1,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: jid,
      serverMessageId: 1,
      newsletterName: name,
    },
  };
}

/**
 * Merge the pill (when configured) into an existing contextInfo object.
 * Returns a fresh object — never mutates the input.
 */
export function withChannelPill(contextInfo = {}) {
  const pill = getChannelPill();
  return pill ? { ...contextInfo, ...pill } : { ...contextInfo };
}

/**
 * Per-chat throttle for the pill on SMALL replies. A pill on every single
 * reply renders the whole "Forwarded → View channel" block on each
 * bubble — spam. Menu cards / invite cards keep their pill (they call
 * withChannelPill directly); ordinary command replies get one per chat
 * per TTL, so the channel stays visible without shouting.
 *   NEXORA_PILL_EVERY_MIN (default 30)
 */
const PILL_TTL = Math.max(1, parseInt(process.env.NEXORA_PILL_EVERY_MIN || '30', 10)) * 60_000;
const lastPillAt = new Map();

/** True when this chat is due for a reply-pill. */
export function chatDueForPill(jid) {
  if (!jid) return false;
  const now = Date.now();
  if (now - (lastPillAt.get(jid) || 0) < PILL_TTL) return false;
  lastPillAt.set(jid, now);
  return true;
}

/** Pill a small reply only when the chat is due. Returns contextInfo or undefined. */
export function withReplyPill(jid, contextInfo = {}) {
  try {
    const merged = chatDueForPill(jid) ? withChannelPill(contextInfo) : { ...contextInfo };
    return Object.keys(merged).length ? merged : undefined;
  } catch (_) {
    return Object.keys(contextInfo).length ? contextInfo : undefined;
  }
}
