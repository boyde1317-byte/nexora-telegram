import { withReactionStatus } from '../../lib/cosmetics.js';

export default {
  name: 'hidetag',
  aliases: ['htag', 'stag', 'silentall'],
  category: 'group',
  description: 'Mentions all group members silently — no @names shown in the message.',
  permissions: { groupOnly: true, admin: true },
  cooldown: 8000,
  execute: async ({ m, sock, args }) => {
    await withReactionStatus(m, async () => {
      const meta = await sock.groupMetadata(m.from);
      if (!meta) throw new Error('Could not retrieve group members.');

      const mentions = meta.participants.map(p => p.id);
      const text = args.join(' ').trim() || '📢';

      await sock.sendMessage(m.from, { text, mentions }, { quoted: m });
    });
  }
};
