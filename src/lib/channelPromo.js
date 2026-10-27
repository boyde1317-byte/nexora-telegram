/**
 * channelPromo.js — privilege-framed channel promotion copy.
 *
 * The channel CTA is written as an EXCLUSIVE PASS, not a beg for follows:
 * joining reads like being let in somewhere most people aren't. Every
 * surface (menu footer, invite card, welcome text) pulls from ONE place
 * so the tone stays consistent and the owner can re-aim it anytime via
 *   • .setchannel <...@newsletter>        (the pill / card target)
 *   • .setchannel link <invite-url>      (the share link)
 *   • DEFAULT_CHANNEL_* env vars         (fallbacks)
 *
 * Never prints a personal JID/LID; channel JIDs/links only.
 */
import { db } from '../database/db.js';
import { isChannelJid } from './menuContext.js';
import { toSmallcaps } from './smallcaps.js';

export const DEFAULT_CHANNEL_INVITE = process.env.DEFAULT_CHANNEL_INVITE || 'https://whatsapp.com/channel/0029Vb7eSHf42Dcmdd3XA326';

/** Current channel context: { jid, name, invite, on } */
export function getChannelContext() {
  const s = db.getSettings?.() || {};
  const jid = (isChannelJid(s.channelId) && s.channelId)
    || process.env.DEFAULT_CHANNEL_JID
    || '120363406397452589@newsletter';
  const name = (isChannelJid(s.channelId) ? s.channelName : null)
    || process.env.DEFAULT_CHANNEL_NAME
    || 'NEXORA Updates';
  const invite = s.channelInvite || DEFAULT_CHANNEL_INVITE;
  return { jid, name, invite, on: !s.channelPillOff };
}

/** One-line CTA for menu footers — short, no link spam. */
export function channelPrivilegeLine(prefix = '.') {
  const c = getChannelContext();
  return `👑 ${toSmallcaps('Inner Circle')} — ${prefix}channel`;
}

/** Full privilege block for welcome texts and info cards. */
export function channelPrivilegeBlock(prefix = '.') {
  const c = getChannelContext();
  return `👑 *${c.name} — Inner Circle*\nEarly drops, releases and giveaways land there first. Membership is by invite only — you're seeing this because you have the pass.\n\n🔗 ${c.invite}\n📲 Or tap *${prefix}channel* for the VIP card.`;
}

/** Caption for the .channel invite card — the "you've been let in" voice. */
export function channelInviteCaption(botName = 'NEXORA') {
  const c = getChannelContext();
  return `👑 *${c.name}* — you've been let in.\n\nNot everyone gets this card. ${botName} drops, releases and member-only giveaways land on this channel first — before anywhere else.\n\nTap *Follow Channel* below to claim your spot. Keep it quiet. 🤫`;
}
