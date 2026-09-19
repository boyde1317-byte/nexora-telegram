import { getQuotedStickerHash, getStickerCommand, deleteStickerCommand } from '../../lib/stickerCommand.js';
import { withReactionStatus } from '../../lib/cosmetics.js';

export default {
  name: 'delsticker',
  aliases: ['removesticker', 'unsticker'],
  category: 'utility',
  description: 'Remove a sticker → command mapping. Reply to the sticker with .delsticker',
  permissions: { owner: true },

  execute: async ({ m }) => {
    const hash = getQuotedStickerHash(m);
    if (!hash) {
      return m.reply.error('Please *reply to the sticker* you want to unregister.');
    }

    const entry = getStickerCommand(hash);
    if (!entry) {
      return m.reply.error('That sticker has no registered command.');
    }

    await withReactionStatus(m, async () => {
      deleteStickerCommand(hash);
      await m.reply.success(`Removed sticker mapping for *.${entry.command}*`);
    });
  }
};
