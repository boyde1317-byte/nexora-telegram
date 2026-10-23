/**
 * muslimai.js — Islamic AI chat (ported from OURIN DELUXE V3.4.1
 * ai/muslimai.js, www.muslimai.io keyless endpoint, live-verified).
 *
 *   .muslimai <question>   → answer with Quran/Hadith sources
 */
import { muslimAi } from '../../lib/aiapis.js';
import { withReactionStatus } from '../../lib/cosmetics.js';

export default {
  name: 'muslimai',
  aliases: ['islamai', 'askislam'],
  category: 'ai',
  description: '🕌 Islamic AI — answers with Quran and Hadith sources. Usage: .muslimai <question>',
  cooldown: 8000,

  execute: async ({ m, args, prefix }) => {
    const p = prefix || '.';
    const query = args.join(' ').trim();
    if (!query) {
      return await m.reply.info(`Ask anything about Islam — answered with sourced references.\n\nExample: \`${p}muslimai what is wudu?\``, 'MUSLIM AI');
    }
    await withReactionStatus(m, async () => {
      try {
        const { reply, sources } = await muslimAi(query);
        const sourceLine = sources.length ? `\n\n📚 *Sources:* ${sources.join(' · ')}` : '';
        await m.reply(reply.slice(0, 3800) + sourceLine);
      } catch (err) {
        console.error('[muslimai]', err.message);
        await m.reply.error(`MuslimAI could not answer: ${err.message}`);
      }
    });
  },
};
