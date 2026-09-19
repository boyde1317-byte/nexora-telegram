/**
 * demote.js — Demote a group admin back to participant.
 *
 * Fixed: duplicate `const targetNumber` declaration was crashing the command.
 * Improved: better target resolution order.
 */
import { withReactionStatus } from '../../lib/cosmetics.js';
import { actionCard } from '../../lib/interactiveKit.js';
import { config } from '../../../config/index.js';

export default {
  name: 'demote',
  aliases: ['unadmin', 'dm'],
  category: 'group',
  description: 'Demotes a group admin back to regular participant.',
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
        'Please reply to a message, @mention a user, or supply their number to demote.'
      );
    }

    const targetNumber = target.split('@')[0];

    if (config.owner.includes(targetNumber)) {
      return await m.reply.error('Cannot modify the bot owner\'s admin status.');
    }

    await withReactionStatus(m, async () => {
      await sock.groupParticipantsUpdate(m.from, [target], 'demote');

      try {
        return await actionCard(sock, m.from, {
          text:   `⬇️ *@${targetNumber}* is back to being a regular member. No more admin powers.`,
          footer: 'NEXORA • Demoted',
        }, [
          { label: '⬆️ Promote Again',     cmd: `${p}promote @${targetNumber}` },
          { label: '🚫 Remove Member',     cmd: `${p}kick` },
          { label: '📋 Group Info',         cmd: `${p}groupinfo` },
        ], { quoted: m, mentions: [target] });
      } catch (_) {
        await m.reply(`✅ *@${targetNumber}* has been demoted. Back to regular.`, {
          mentions: [target]
        });
      }
    });
  }
};
