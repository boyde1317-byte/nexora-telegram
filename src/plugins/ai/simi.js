/**
 * simi.js — SimiSimi-style chat (ported from OURIN DELUXE V3.4.1 ai/simi.js,
 * api.nexray.eu.cc keyless endpoint, live-verified).
 *
 *   .simi <text>   → sassy AI reply
 */
import { simiChat } from '../../lib/aiapis.js';
import { withReactionStatus } from '../../lib/cosmetics.js';

export default {
  name: 'simi',
  aliases: ['simisimi'],
  category: 'ai',
  description: '💬 SimiSimi-style casual AI chat. Usage: .simi <text>',
  cooldown: 4000,

  execute: async ({ m, args, prefix }) => {
    const p = prefix || '.';
    const text = args.join(' ').trim();
    if (!text) {
      return await m.reply.info(`Chat with Simi, the sassy yellow bird.\n\nExample: \`${p}simi how are you?\``, 'SIMI');
    }
    await withReactionStatus(m, async () => {
      try {
        const reply = await simiChat(text);
        await m.reply(reply);
      } catch (err) {
        console.error('[simi]', err.message);
        await m.reply.error(`Simi is silent: ${err.message}`);
      }
    });
  },
};
