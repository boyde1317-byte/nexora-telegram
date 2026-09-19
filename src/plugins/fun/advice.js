import { mixedCard } from '../../lib/interactiveKit.js';
import { withReactionStatus } from '../../lib/cosmetics.js';

export default {
  name: 'advice',
  aliases: ['tip'],
  category: 'fun',
  description: 'Get random life advice. Usage: .advice',
  cooldown: 5000,
  execute: async ({ sock, m, prefix }) => {
    await withReactionStatus(m, async () => {
      try {
        const res = await fetch('https://api.adviceslip.com/advice');
        const data = await res.json();
        
        const adviceText = data.slip.advice;
        
        await mixedCard(sock, m.from, {
          text: `✦ *ADVICE* ✦\n\n💭 ${adviceText}`,
          footer: `Advice #${data.slip.id}`
        }, [
          { kind: 'copy', label: '📋 Copy', value: adviceText },
          { kind: 'action', label: '🔄 Another Tip', cmd: `${prefix}advice` },
          { kind: 'action', label: '🎲 Random Fact', cmd: `${prefix}fact` },
          { kind: 'action', label: '💬 Inspiration',  cmd: `${prefix}quote` }
        ], { quoted: m });
      } catch (err) {
        await m.reply.error(`Could not fetch advice: ${err.message}`);
      }
    });
  }
};
