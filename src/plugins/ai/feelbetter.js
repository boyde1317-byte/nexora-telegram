/**
 * feelbetter.js — empathetic "healing" chat (ported from OURIN DELUXE V3.4.1
 * ai/feelbetter.js + scraper/feeb.js, feelbetterbot.com, live-verified —
 * streams supportive responses and remembers context per user).
 *
 *   .feelbetter <text>   → a supportive ear
 */
import { feelBetter } from '../../lib/aiapis.js';
import { withReactionStatus } from '../../lib/cosmetics.js';

/** Per-user conversation memory (feelbet-memory cookie id). */
const memory = new Map();
const memoryFor = (jid) => {
  if (!memory.has(jid)) memory.set(jid, `nexora-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  return memory.get(jid);
};
const history = new Map();

export default {
  name: 'feelbetter',
  aliases: ['feeb', 'feelbetterbot', 'healing'],
  category: 'ai',
  description: '💚 A supportive AI listener when you need to vent. Usage: .feelbetter <text>',
  cooldown: 6000,

  execute: async ({ m, args, sender, prefix }) => {
    const p = prefix || '.';
    const text = args.join(' ').trim();
    if (!text) {
      return await m.reply.info(
        `Sometimes you just need someone to listen. This one talks back, kindly.\n\nExample: \`${p}feelbetter had a rough day at work\`\n\nIt remembers your conversation, so you can keep talking.`,
        'FEEL BETTER'
      );
    }
    await withReactionStatus(m, async () => {
      try {
        const id = memoryFor(sender);
        const convo = history.get(sender) || [];
        convo.push({ role: 'user', content: text });
        // Keep the last 8 turns for context
        const trimmed = convo.slice(-8);
        const reply = await feelBetter(trimmed, id);
        trimmed.push({ role: 'assistant', content: reply });
        history.set(sender, trimmed.slice(-8));
        await m.reply(reply);
      } catch (err) {
        console.error('[feelbetter]', err.message);
        await m.reply.error(`Could not reach the listener: ${err.message}`);
      }
    });
  },
};
