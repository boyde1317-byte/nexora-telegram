import { actionCard } from '../../lib/interactiveKit.js';
import { withReactionStatus } from '../../lib/cosmetics.js';

export default {
  name: 'cat',
  aliases: ['cats', 'meow'],
  category: 'fun',
  description: 'Get a random cat picture. Usage: .cat',
  cooldown: 5000,
  execute: async ({ sock, m, prefix }) => {
    await withReactionStatus(m, async () => {
      try {
        const res = await fetch('https://api.thecatapi.com/v1/images/search');
        if (!res.ok) throw new Error('API failed');
        const data = await res.json();
        
        await actionCard(sock, m.from, {
          text: `✦ *RANDOM CAT* ✦\n\nHere\'s a cat to brighten your day. 🐱`,
          image: { url: data[0].url },
          footer: 'NEXORA • Meow 🐱'
        }, [
          { label: '🔄 Another Cat', cmd: `${prefix}cat` },
          { label: '🐶 Get a Dog',     cmd: `${prefix}dog` }
        ], { quoted: m });
      } catch (err) {
        await m.reply.error(`Could not fetch image: ${err.message}`);
      }
    });
  }
};
