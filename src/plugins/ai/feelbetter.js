/**
 * feelbetter.js — empathetic "healing" chat (ported from OURIN DELUXE V3.4.1
 * ai/feelbetter.js + scraper/feeb.js, feelbetterbot.com, live-verified —
 * streams supportive responses and remembers context per user).
 *
 *   .feelbetter <text>   → a supportive ear
 */
import { feelBetter } from '../../lib/aiapis.js';
import { withReactionStatus } from '../../lib/cosmetics.js';
import { getHistory, pushTurn, forget } from '../../lib/chatMemory.js';

/** Healing thread key (persona-scoped). */
const memKey = (jid) => `feelbetter:${jid}`;



export default {
  name: 'feelbetter',
  aliases: ['feeb', 'feelbetterbot', 'healing'],
  category: 'ai',
  description: '💚 A supportive AI listener when you need to vent. Usage: .feelbetter <text>',
  cooldown: 6000,

  execute: async ({ m, args, sender, prefix }) => {
    const p = prefix || '.';
    const sub = args[0]?.toLowerCase();
    if (sub === 'reset' || sub === 'clear') {
      forget(memKey(sender));
      return await m.reply.success('🧵 Session cleared. We can start over whenever you are ready. 💚');
    }
    const text = args.join(' ').trim();
    if (!text) {
      return await m.reply.info(
        `Sometimes you just need someone to listen. This one talks back, kindly.\n\nExample: \`${p}feelbetter had a rough day at work\`\n\nIt remembers your conversation, so you can keep talking.`,
        'FEEL BETTER'
      );
    }
    await withReactionStatus(m, async () => {
      try {
        const id = `nexora-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        const key = memKey(sender);
        const convo = getHistory(key).map((t) => ({ role: t.role, content: t.text }));
        convo.push({ role: 'user', content: text });
        const reply = await feelBetter(convo, id);
        pushTurn(key, 'user', text);
        pushTurn(key, 'assistant', reply);
        await m.reply(reply);
      } catch (err) {
        console.error('[feelbetter]', err.message);
        await m.reply.error(`Could not reach the listener: ${err.message}`);
      }
    });
  },
};
