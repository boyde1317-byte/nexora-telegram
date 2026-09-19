import { buildEnrichedContextInfo } from '../../lib/enrichContext.js';
import { client } from '../../core/client.js';
import { db } from '../../database/db.js';
import { withReactionStatus } from '../../lib/cosmetics.js';

export default {
  name: 'restart',
  aliases: ['reboot'],
  category: 'owner',
  description: 'Hot-reloads all plugin files, or restarts the container process.',
  permissions: {
    owner: true
  },
  execute: async ({ m, args, prefix }) => {
    const p = prefix || '.';
    const isHardRestart = args.includes('hard');

    if (isHardRestart) {
      await withReactionStatus(m, async () => {
        await m.reply('🔌 *Hard Restart: Saving database and terminating process for container reboot...*');
        db.save();
        setTimeout(() => {
          process.exit(0);
        }, 1000);
      }, { clearOnSuccess: true });
    } else {
      await withReactionStatus(m, async () => {
        await m.reply('🔄 *Hot-Reload: Clearing and re-importing all command files...*');
        try {
          db.save();
          await client.loadPlugins();
          await m.reply(`✅ *All plugins reloaded successfully!* Bot is updated without connection loss.\n\n_Tip: Run \`${p}restart hard\` to completely reboot the bot container._`, { contextInfo: buildEnrichedContextInfo() });
        } catch (err) {
          await m.reply.error(`*Hot-reload failed:* ${err.message}`);
          throw err;
        }
      });
    }
  }
};
