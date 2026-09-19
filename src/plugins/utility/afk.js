/**
 * afk.js — away-from-keyboard status with automatic notifications.
 *
 * `.afk [reason]` marks the sender AFK. While AFK, anyone who mentions or
 * replies to them (group or DM) gets an automatic notice with the reason
 * and how long they've been away. Sending any other message clears AFK
 * automatically and posts a short "welcome back" note.
 *
 * The passive detection (auto-reply on mention/reply, auto-clear on next
 * message) is wired into src/handlers/message.js — see the "AFK" block
 * there, which runs the same way the existing anti-link enforcement does
 * (there is no generic onMessage plugin dispatch in this codebase yet).
 *
 * Uses actionCard for a quick "Clear AFK" follow-up button, matching the
 * button styling used across the rest of the bot's commands.
 */
import { buildEnrichedContextInfo } from '../../lib/enrichContext.js';
import { actionCardWithAd } from '../../lib/interactiveKit.js';
import { getBrandThumbnail } from '../../lib/cosmetics.js';
import { asciiBuilder } from '../../ui/asciiBuilder.js';
import { formatDuration } from '../../lib/utils.js';

export default {
  name: 'afk',
  aliases: ['away'],
  category: 'utility',
  description: 'Set yourself as AFK. Anyone who mentions or replies to you is notified automatically.',
  cooldown: 2000,
  execute: async ({ m, sock, db, args, prefix }) => {
    const p = prefix || '.';
    const reason = args.join(' ').trim() || 'No reason given';
    const userData = db.getUser(m.sender);

    if (userData.afk?.active) {
      db.setUser(m.sender, { afk: { active: false } });
      return await m.reply.success('You are no longer marked as AFK.');
    }

    db.setUser(m.sender, { afk: { active: true, reason, since: Date.now() } });

    try {
      const thumbnailUrl = await getBrandThumbnail();
      return await actionCardWithAd(sock, m.from, {
        text: `💤 *AFK MODE ON*

Reason: ${reason}

Anyone who mentions or replies to you will be notified.`,
        footer: 'Send any message, or tap below, to come back',
      }, [
        { label: 'Clear AFK Now',    cmd: `${p}afk` },
      ], {
        title: '💤 AFK MODE',
        body:  reason,
        thumbnailUrl,
        originalImageUrl: thumbnailUrl,
      }, { quoted: m });
    } catch (err) {
      console.warn('[afk] actionCardWithAd failed, plain text:', err.message);
      return await m.reply(asciiBuilder.box('💤 AFK MODE ON', [
        `Reason: ${reason}`,
        '',
        'Anyone who mentions or replies to you will be notified.',
        'Send any message to come back automatically.',
      ]), { contextInfo: buildEnrichedContextInfo() });
    }
  }
};
