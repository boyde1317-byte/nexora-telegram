/**
 * promote.js — Promote a group participant to admin.
 *
 * Fixed: duplicate `const targetNumber` declaration was crashing the command.
 * Improved: better target resolution order, self-promotion check.
 */
import { withReactionStatus } from '../../lib/cosmetics.js';
import { actionCard } from '../../lib/interactiveKit.js';
import { config } from '../../../config/index.js';

export default {
  name: 'promote',
  aliases: ['admin', 'pm'],
  category: 'group',
  description: 'Promotes a group participant to Group Admin.',
  permissions: {
    groupOnly: true,
    admin: true,
    botAdmin: true
  },
  execute: async ({ sock, m, args, prefix }) => {
    const p = prefix || '.';
    let target = '';

    if (m.quoted) {
      target = m.quoted.sender;
    } else if (m.msg?.contextInfo?.mentionedJid?.length) {
      target = m.msg.contextInfo.mentionedJid[0];
    } else if (args[0]) {
      const cleanNum = args[0].replace(/[^0-9]/g, '');
      if (cleanNum) target = `${cleanNum}@s.whatsapp.net`;
    }

    if (!target) {
      return await m.reply.error(
        'Please reply to a message, @mention a user, or supply their number to promote.'
      );
    }

    const targetNumber = target.split('@')[0];

    if (target === sock.user.id.split(':')[0] + '@s.whatsapp.net') {
      return await m.reply.error('I\'m already an admin (or trying to be). No need to promote myself.');
    }
    if (config.owner.includes(targetNumber)) {
      return await m.reply.error('Cannot modify the bot owner\'s admin status.');
    }

    await withReactionStatus(m, async () => {
      await sock.groupParticipantsUpdate(m.from, [target], 'promote');

      try {
        return await actionCard(sock, m.from, {
          text:   `⬆️ *@${targetNumber}* is now a Group Admin. With great power... you know the rest.`,
          footer: 'NEXORA • Promoted',
        }, [
          { label: '⬇️ Demote Again',      cmd: `${p}demote @${targetNumber}` },
          { label: '🚫 Remove Member',     cmd: `${p}kick` },
          { label: '📋 Group Info',         cmd: `${p}groupinfo` },
        ], { quoted: m, mentions: [target] });
      } catch (_) {
        await m.reply(`✅ *@${targetNumber}* is now an admin! 👑`, {
          mentions: [target]
        });
      }
    });
  }
};
