/**
 * statusprivacy.js — Control who can see your WhatsApp Status.
 *
 * Usage:
 *   .statusprivacy all          — Everyone can see your status
 *   .statusprivacy contacts     — Only contacts
 *   .statusprivacy contacts_blacklist — All except blocked contacts
 *
 * Usage: .statusprivacy
 */
import { withReactionStatus } from '../../lib/cosmetics.js';

export default {
  name: 'statusprivacy',
  aliases: [],
  category: 'owner',
  description: 'Controls who can see your WhatsApp Status.',
  permissions: { owner: true },
  cooldown: 3000,

  execute: async ({ sock, m, args, prefix, isOwner }) => {
    const p = prefix || '.';

    if (!isOwner) {
      return await m.reply.error('Only the bot owner can change status privacy.');
    }

    const input = (args[0] || '').toLowerCase();
    const valid = ['all', 'contacts', 'contacts_blacklist'];

    if (!input || !valid.includes(input)) {
      return await m.reply.error(
        `Usage:\n• \`${p}statusprivacy all\` — Everyone\n• \`${p}statusprivacy contacts\` — Only contacts\n• \`${p}statusprivacy contacts_blacklist\` — All except blocked`
      );
    }

    await withReactionStatus(m, async () => {
      try {
        await sock.updateStatusPrivacy(input);
        await m.reply.success(`✅ Status privacy set to: *${input}*`);
      } catch (err) {
        await m.reply.error(`Failed to update status privacy: ${err.message}`);
      }
    });
  }
};
