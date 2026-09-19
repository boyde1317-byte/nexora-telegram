/**
 * taginfo.js — Show info about a quoted or mentioned user.
 *
 * .taginfo (reply to a message)  — info about the replied user
 * .taginfo @user                 — info about the mentioned user
 *
 * Shows: number, name (if available), admin status in group, warn count,
 * economy stats (level, coins, XP), AFK status.
 */
import { withReactionStatus } from '../../lib/cosmetics.js';
import { richTableCard } from '../../lib/interactiveKit.js';
import { asciiBuilder } from '../../ui/asciiBuilder.js';
import { getLevelProgress, progressBar, rankBadge } from '../../economy/leveling.js';

export default {
  name: 'taginfo',
  aliases: ['userinfo2', 'checkuser'],
  category: 'group',
  description: 'Show info about a user. Reply to their message or @mention them.',
  cooldown: 3000,
  execute: async ({ m, sock, db, prefix }) => {
    const p = prefix || '.';

    // Determine target
    let targetJid = null;
    if (m.quoted) {
      targetJid = m.quoted.sender;
    } else if (m.msg?.contextInfo?.mentionedJid?.length) {
      targetJid = m.msg.contextInfo.mentionedJid[0];
    }

    if (!targetJid) {
      return await m.reply.info(
        `Usage:\n• Reply to someone's message and type \`${p}taginfo\`\n• Or \`${p}taginfo @user\``,
        'USER INFO'
      );
    }

    await withReactionStatus(m, async () => {
      const number = targetJid.split('@')[0].split(':')[0];
      const userData = db.getUser(targetJid);
      const progress = getLevelProgress(userData.xp ?? 0);
      const badge = rankBadge(progress.level);
      const bar = progressBar(progress.xpIntoLevel, progress.nextLevelXp - progress.currentLevelXp);

      // Try to get their name from WhatsApp
      let userName = null;
      try {
        const [contact] = await sock.onWhatsApp(targetJid).catch(() => []);
        if (contact) {
          userName = sock.store?.contacts?.get(targetJid)?.name || sock.store?.contacts?.get(targetJid)?.notify || null;
        }
      } catch (_) {}

      // Check admin status in group
      let isAdmin = false;
      let isBotAdmin = false;
      const isGroup = m.from?.endsWith('@g.us');
      if (isGroup) {
        try {
          const metadata = await sock.groupMetadata(m.from);
          const participant = metadata.participants.find(p => p.id === targetJid);
          if (participant) {
            isAdmin = participant.admin === 'admin' || participant.admin === 'superadmin';
          }
        } catch (_) {}
      }

      // Check AFK status
      const afkActive = userData.afk?.active;
      const afkReason = userData.afk?.reason;

      const rows = [
        ['Number',   `+${number}`],
        ...(userName ? [['Name', userName]] : []),
        ['On WhatsApp', '✅ Yes'],
        ...(isGroup ? [['Group Admin', isAdmin ? '✅ Yes' : '❌ No']] : []),
        ['Level',    `${progress.level} (${badge})`],
        ['XP',       (userData.xp ?? 0).toLocaleString()],
        ['Coins',    `🪙 ${(userData.coins ?? 0).toLocaleString()}`],
        ['Progress', bar],
        ...(userData.streak ? [['Streak', `${userData.streak} days`]] : []),
        ...(afkActive ? [['AFK', `💤 ${afkReason || 'No reason'}`]] : []),
      ];

      try {
        await richTableCard(sock, m.from, {
          title:   `👤 USER INFO — +${number}`,
          headers: ['Field', 'Value'],
          rows,
          footer: 'NEXORA • Tag Info',
        }, { quoted: m });
      } catch (err) {
        console.warn('[taginfo] richTableCard failed:', err.message);
        const lines = rows.map(([k, v]) => `${k.padEnd(12)} : ${v}`);
        await m.reply(asciiBuilder.box(`USER INFO — +${number}`, lines));
      }
    });
  }
};
