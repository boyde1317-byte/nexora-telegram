import { mixedCard } from '../../lib/interactiveKit.js';
import { withReactionStatus } from '../../lib/cosmetics.js';

export default {
  name: 'fact',
  aliases: ['facts'],
  category: 'fun',
  description: 'Get a random interesting fact. Usage: .fact',
  cooldown: 5000,
  execute: async ({ sock, m, prefix }) => {
    await withReactionStatus(m, async () => {
      try {
        const res = await fetch('https://uselessfacts.jsph.pl/api/v2/facts/random');
        if (!res.ok) throw new Error('API failed');
        const data = await res.json();
        
        await mixedCard(sock, m.from, {
          text: `✦ *DID YOU KNOW?* ✦\n\n🧠 ${data.text}`,
          footer: 'NEXORA • Fun Facts'
        }, [
          { kind: 'copy', label: '📋 Copy', value: data.text },
          { kind: 'action', label: '🔄 Another Fact', cmd: `${prefix}fact` },
          { kind: 'action', label: '🧠 Trivia Game',   cmd: `${prefix}trivia` },
          { kind: 'action', label: '💭 Get Advice',    cmd: `${prefix}advice` }
        ], { quoted: m });
      } catch (err) {
        await m.reply.error(`Could not fetch fact: ${err.message}`);
      }
    });
  }
};
