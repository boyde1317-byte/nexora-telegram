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
