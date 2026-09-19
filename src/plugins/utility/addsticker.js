import { getQuotedStickerHash, addStickerCommand, findByCommand } from '../../lib/stickerCommand.js';
import { withReactionStatus } from '../../lib/cosmetics.js';

export default {
  name: 'addsticker',
  aliases: ['setsticker'],
  category: 'utility',
  description: 'Map a sticker to a bot command. Reply to a sticker with .addsticker <command>',
  permissions: { owner: true },

  execute: async ({ m, args }) => {
    const commandName = args[0]?.replace(/^\./, '').toLowerCase();

    if (!commandName) {
      return m.reply.warn(
        'Usage: reply to a sticker with *.addsticker <command>*\n' +
        'Example: `.addsticker menu`'
      );
    }

    const hash = getQuotedStickerHash(m);
    if (!hash) {
      return m.reply.error('Please *reply to a sticker* to register it.');
    }

    const existing = findByCommand(commandName);
    if (existing) {
      return m.reply.error(
        `The command *${commandName}* is already mapped to a sticker.\n` +
        'Use *.delsticker* (reply to that sticker) to remove it first.'
      );
    }

    await withReactionStatus(m, async () => {
      addStickerCommand(hash, commandName, m.sender);
      await m.reply.success(`Sticker registered → *.${commandName}*\nSend that sticker anytime to trigger the command.`);
    });
  }
};
