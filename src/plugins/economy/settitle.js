/**
 * settitle.js — Set a custom title on your profile (purchased from shop).
 *
 * Users who bought 'Custom Title' from the shop can set a short title
 * that appears on their profile card. This is a user-level command
 * (not owner-only) gated by the customTitle flag in user data.
 */
import { withReactionStatus } from '../../lib/cosmetics.js';

const MAX_TITLE_LENGTH = 30;

export default {
  name: 'settitle',
  aliases: ['title', 'mytitle'],
  category: 'economy',
  description: `Set a custom title on your profile (requires shop purchase). Max ${MAX_TITLE_LENGTH} chars.`,
  cooldown: 3000,
  execute: async ({ m, db, args, prefix }) => {
    const p = prefix || '.';
    const userData = db.getUser(m.sender);

    if (!userData.customTitle) {
      return await m.reply.warn(
        `You haven't purchased the *Custom Title* perk yet.\n\nBuy it from the shop with \`${p}shop buy title\` (500 🪙).`
      );
    }

    const title = args.join(' ').trim();

    if (!title) {
      const current = userData.title || '*(not set)*';
      return await m.reply.info(
        `Usage: \`${p}settitle <your title>\`\n\nCurrent title: ${current}\n\nClear it with \`${p}settitle clear\``,
        'CUSTOM TITLE'
      );
    }

    if (title.toLowerCase() === 'clear' || title.toLowerCase() === 'remove') {
      db.setUser(m.sender, { title: null });
      return await m.reply.success('✅ Custom title cleared.');
    }

    if (title.length > MAX_TITLE_LENGTH) {
      return await m.reply.warn(`Title too long — max ${MAX_TITLE_LENGTH} characters. Yours is ${title.length}.`);
    }

    db.setUser(m.sender, { title });
    return await m.reply.success(`✅ Title set to: *${title}*\n\nIt will appear on your profile card.`);
  }
};
