import { actionCard } from '../../lib/interactiveKit.js';
import { withReactionStatus } from '../../lib/cosmetics.js';

export default {
  name: 'dog',
  aliases: ['dogs', 'woof'],
  category: 'fun',
  description: 'Get a random dog picture. Usage: .dog',
  cooldown: 5000,
  execute: async ({ sock, m, prefix }) => {
    await withReactionStatus(m, async () => {
      try {
        const res = await fetch('https://api.thedogapi.com/v1/images/search');
        if (!res.ok) throw new Error('API failed');
        const data = await res.json();
        
        await actionCard(sock, m.from, {
          text: `✦ *RANDOM DOG* ✦\n\nWho\'s a good bot? Here\'s a good dog. 🐶`,
          image: { url: data[0].url },
          footer: 'NEXORA • Woof 🐶'
        }, [
          { label: '🔄 Another Dog', cmd: `${prefix}dog` },
          { label: '🐱 Get a Cat',     cmd: `${prefix}cat` }
        ], { quoted: m });
      } catch (err) {
        await m.reply.error(`Could not fetch image: ${err.message}`);
      }
    });
  }
};
