/**
 * userInfo.js — Enhanced user info card with interactive buttons.
 *
 * Shows detailed user profile: name, number, level, XP, coins, rank,
 * warnings, premium status, ban status, and member since date.
 *
 * Phone display: senders can arrive as opaque LIDs (@lid) — the raw digits
 * are meaningless to humans. We resolve the real phone number through the
 * signal repository mapping, then fall back to the group metadata bridge
 * (participant nodes carry a phone_number attribute), then to the bot's own
 * JID for self-lookups. Only if all three fail do we show "hidden".
 *
 * Enrichment: the reply card is personalized — the adReply banner carries
 * the user's own profile picture, their display name, and a tap-to-chat
 * wa.me link to their number.
 */
import { db } from '../../database/db.js';
import { asciiBuilder } from '../../ui/asciiBuilder.js';
import { getLevelProgress, rankBadge, streakEmoji, progressBar } from '../../economy/leveling.js';
import { getDisplayName } from '../../lib/displayName.js';
import { toSmallcaps } from '../../lib/smallcaps.js';

import { formatDuration } from '../../lib/utils.js';
import { buildEnrichedContextInfo } from '../../lib/enrichContext.js';
import { resolvePhoneJid } from '../../core/serializer.js';

/** Strip device/agent suffix: '123:5@s.whatsapp.net' → '123@s.whatsapp.net' */
const bareJid = (jid) => (jid || '').split(':')[0];

/**
 * Resolve the human-readable phone number behind a JID.
 * Returns the bare digits (no '+'), or null when it can't be resolved.
 *
 * @param {import('baileys').WASocket} sock
 * @param {string}  jid       Target JID (phone or LID form)
 * @param {boolean} fromMe    Whether the lookup target is the bot itself
 * @param {string}  groupJid  Chat JID, used for the group metadata bridge
 * @returns {Promise<string|null>}
 */
async function resolveDisplayPhone(sock, jid, fromMe = false, groupJid = null) {
  const norm = bareJid(jid);
  if (!norm) return null;

  // Already a phone-number JID — digits are the answer.
  if (norm.endsWith('@s.whatsapp.net')) return norm.split('@')[0];

  if (norm.endsWith('@lid')) {
    // 1. Authoritative LID → phone mapping from the signal repository
    //    (populated once a session exists for the LID).
    try {
      const pn = await resolvePhoneJid(sock, norm);
      if (pn && pn !== norm && pn.endsWith('@s.whatsapp.net')) {
        return pn.split('@')[0];
      }
    } catch (_) { /* no mapping stored yet */ }

    // 2. Group metadata bridge — WhatsApp stamps phone_number/lid attrs on
    //    each participant node, no session required. Works for any member
    //    of a group the bot is in, even brand-new LIDs.
    if (groupJid && groupJid.endsWith('@g.us')) {
      try {
        const meta = await sock.groupMetadata(groupJid);
        const p = meta?.participants?.find(part =>
          bareJid(part.id) === norm || bareJid(part.lid) === norm
        );
        if (p?.phoneNumber) return p.phoneNumber.replace(/[^0-9]/g, '');
      } catch (_) { /* not in group / rate-limited */ }
    }

    // 3. Self lookup — the bot's own number is always known.
    if (fromMe && sock.user?.id) return bareJid(sock.user.id).split('@')[0];
  }

  return null;
}

/**
 * Fetch a JID's profile picture as a Buffer (for the adReply thumbnail).
 * Returns null on any failure — the default logo is used instead.
 *
 * @param {import('baileys').WASocket} sock
 * @param {string} jid
 * @returns {Promise<Buffer|null>}
 */
async function fetchProfilePicture(sock, jid) {
  try {
    const url = await sock.profilePictureUrl(bareJid(jid), 'image');
    if (!url) return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // Reject empty / oversized (WA rejects huge thumbnails)
    return (buf.length > 0 && buf.length < 500_000) ? buf : null;
  } catch (_) {
    return null;
  }
}

export default {
  name: 'userinfo',
  aliases: ['whoami', 'profile2'],
  category: 'utility',
  description: 'Shows your detailed user profile with stats and account info.',
  cooldown: 2000,
  execute: async ({ sock, m, args, prefix }) => {
    const p = prefix || '.';

    // Allow viewing other users: .userinfo @mention or .userinfo <number>
    let targetJid = m.sender;
    if (m.mentioned && m.mentioned.length > 0) {
      targetJid = m.mentioned[0];
    } else if (args[0] && /^\d+$/.test(args[0].replace(/[^0-9]/g, ''))) {
      targetJid = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
    }

    const user = db.getUser(targetJid);

    // ── Phone resolution (never show raw JID/LID digits) ──────────────────
    const phone = await resolveDisplayPhone(
      sock,
      targetJid,
      m.fromMe || targetJid === bareJid(sock.user?.id),
      m.isGroup ? m.from : null
    );
    const numberLabel = phone ? `+${phone}` : 'Hidden (WhatsApp LID)';

    // Name lookup goes through the resolved phone JID — getDisplayName calls
    // onWhatsApp() with the digits, which only works for phone numbers, never
    // opaque LIDs.
    const name = await getDisplayName(sock, phone ? `${phone}@s.whatsapp.net` : targetJid);

    const progress = getLevelProgress(user.xp || 0);
    const streak = user.streak || 0;
    const memberSince = user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    }) : 'Unknown';

    // Account age
    const accountAge = user.createdAt
      ? formatDuration(Date.now() - user.createdAt)
      : 'Unknown';

    const lines = [
      `👤 *${toSmallcaps('User Profile')}*`,
      ``,
      `▸ *Name*      : ${name}`,
      `▸ *Number*    : ${numberLabel}`,
      `▸ *Status*    : ${user.banned ? '🚫 Banned' : user.premium ? '⭐ Premium' : '✅ Active'}`,
      ``,
      `${'─'.repeat(22)}`,
      `📊 *${toSmallcaps('Leveling')}*`,
      ``,
      `▸ *Level*     : ${progress.level} ${rankBadge(progress.level)}`,
      `▸ *Total XP*  : ${progress.xp.toLocaleString()}`,
      `▸ *Progress*  : ${progressBar(progress.xpIntoLevel, progress.nextLevelXp - progress.currentLevelXp)}`,
      `▸ *Next lvl*  : ${progress.xpToNextLevel.toLocaleString()} XP away`,
      `▸ *Coins*     : ${(user.coins || 0).toLocaleString()} 🪙`,
      `▸ *Streak*    : ${streak} day${streak !== 1 ? 's' : ''} ${streakEmoji(streak)}`,
      ``,
      `${'─'.repeat(22)}`,
      `📋 *${toSmallcaps('Account')}*`,
      ``,
      `▸ *Member since* : ${memberSince}`,
      `▸ *Account age*  : ${accountAge}`,
      `▸ *Warnings*    : ${user.warnings || 0}/3`,
    ];

    if (user.banned) {
      lines.push(`▸ *Ban reason* : ${user.banReason || 'Not specified'}`);
    }

    if (user.lastDaily) {
      const lastDaily = new Date(user.lastDaily);
      lines.push(`▸ *Last daily* : ${lastDaily.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`);
    }

    const text = asciiBuilder.box('User Info', lines);

    // ── Enriched, personalized card ────────────────────────────────────────
    // AdReply banner carries the target's own profile picture + name, and
    // tapping it opens a wa.me chat with their number.
    const pfp = await fetchProfilePicture(sock, phone ? `${phone}@s.whatsapp.net` : targetJid);
    const contextInfo = await buildEnrichedContextInfo({
      adTitle: name,
      adBody: phone ? `Tap to chat with +${phone}` : 'User Profile',
      sourceUrl: phone ? `https://wa.me/${phone}` : undefined,
      thumbnail: pfp || undefined,
      renderLargerThumbnail: true,
    });

    await m.reply(text, { contextInfo });
  },
};
