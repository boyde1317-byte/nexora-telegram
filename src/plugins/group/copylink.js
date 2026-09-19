/**
 * copylink.js — Fetch and copy the current group's invite link.
 *
 * Fixed: removed 'grouplink' alias that conflicted with grouplink.js.
 */
import { copyResultCard } from '../../lib/interactiveKit.js';

export default {
  name: 'copylink',
  aliases: ['gcl'],
  category: 'group',
  description: 'Get the current group\'s invite link with a copy button.',
  cooldown: 5000,
  permissions: { admin: true },
  execute: async ({ m, sock, prefix }) => {
    const p = prefix || '.';

    if (!m.isGroup) {
      return await m.reply.error('This command only works in groups.');
    }

    try {
      const code = await sock.groupInviteCode(m.from);
      const link = `https://chat.whatsapp.com/${code}`;

      await copyResultCard(sock, m.from, {
        text:       `🔗 *Group Invite Link*\n\n${link}`,
        copyLabel:  '📋 Copy Link',
        copyValue:  link,
        footer:     'NEXORA-MD',
        extraButtons: [
          { text: '🔄 Revoke Link', id: `${p}revoke` },
        ],
      }, { quoted: m });
    } catch (err) {
      await m.reply.error(`Could not fetch the invite link: ${err.message}`);
    }
  }
};
