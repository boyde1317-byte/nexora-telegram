/**
 * purge.js — Delete multiple messages in a chat (admin/owner only).
 * Usage: .purge <count> — deletes the last N messages from the bot
 * Or reply to a message with .purge — deletes from that message onward (bot messages only)
 */
import { asciiBuilder } from '../../ui/asciiBuilder.js';
import { buildEnrichedContextInfo } from '../../lib/enrichContext.js';

export default {
  name: 'purge',
  aliases: ['prune', 'delmsg'],
  category: 'group',
  description: 'Delete multiple messages. Usage: .purge <count> | reply + .purge',
  cooldown: 3000,
  permissions: { admin: true, owner: true },
  execute: async ({ sock, m, args }) => {
    const count = parseInt(args[0], 10) || 0;

    if (count === 0 && !m.quoted) {
      return await m.reply.error(
        'Usage: `.purge <count>` (deletes last N bot messages)\nOr reply to a message with `.purge`'
      );
    }

    try {
      let deleted = 0;

      if (count > 0) {
        // Delete the last N messages (the bot's own messages)
        // We can only delete messages we can access — use the store
        const store = sock.opts?.messageStore;
        if (!store) return await m.reply.error('Message store not available.');

        const chatMsgs = store.get(m.from);
        if (!chatMsgs || chatMsgs.size === 0) {
          return await m.reply.error('No cached messages found to purge.');
        }

        const msgs = [...chatMsgs.values()].reverse().slice(0, count);
        for (const msg of msgs) {
          if (msg.key.fromMe || msg.key.id === m.key.id) {
            try {
              await sock.sendMessage(m.from, { delete: msg.key });
              deleted++;
              await new Promise(r => setTimeout(r, 200));
            } catch (_) {}
          }
        }
      } else if (m.quoted) {
        // Delete from the quoted message to the current message
        try {
          await sock.sendMessage(m.from, { delete: m.quoted.key });
          deleted++;
        } catch (_) {}
      }

      return await m.reply(asciiBuilder.box('Purge Complete', [
        `🗑️ Deleted ${deleted} message${deleted !== 1 ? 's' : ''}`,
      ]), { contextInfo: buildEnrichedContextInfo() });
    } catch (err) {
      return await m.reply.error(`Purge failed: ${err.message}`);
    }
  },
};
