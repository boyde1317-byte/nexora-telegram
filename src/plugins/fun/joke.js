import { withReactionStatus } from '../../lib/cosmetics.js';
import { mixedCard } from '../../lib/interactiveKit.js';

export default {
  name: 'joke',
  aliases: ['jokes', 'funny', 'lol'],
  category: 'fun',
  description: 'Fetches a random safe-mode joke from JokeAPI.',
  cooldown: 3000,
  execute: async ({ sock, m, args, prefix }) => {
    const category = args[0]?.toLowerCase();
    const validCategories = ['programming', 'misc', 'dark', 'pun', 'spooky', 'christmas'];
    const cat = validCategories.includes(category) ? category : 'Any';

    await withReactionStatus(m, async () => {
      try {
        const res = await fetch(
          `https://v2.jokeapi.dev/joke/${cat}?safe-mode&blacklistFlags=nsfw,racist,sexist`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (!res.ok) throw new Error('JokeAPI unavailable, try again.');
        const data = await res.json();

        if (data.error) throw new Error('No joke found.');

        let text;
        if (data.type === 'twopart') {
          text = `✦ *JOKE — ${data.category.toUpperCase()}* ✦\n\n*Setup:* ${data.setup}\n\n*Punchline:* ${data.delivery}`;
        } else {
          text = `✦ *JOKE — ${data.category.toUpperCase()}* ✦\n\n☕ ${data.joke}`;
        }

        await mixedCard(sock, m.from, {
          text,
          footer: 'NEXORA • Comedy Club'
        }, [
          { kind: 'copy', label: '📋 Copy Joke', value: data.type === 'twopart' ? `${data.setup}\n\n${data.delivery}` : data.joke },
          { kind: 'action', label: '🔄 Next Joke', cmd: `${prefix}joke` },
          { kind: 'action', label: '🎲 Programming', cmd: `${prefix}joke programming` },
          { kind: 'action', label: '👻 Spooky',       cmd: `${prefix}joke spooky` }
        ], { quoted: m });
      } catch (err) {
        await m.reply.error(err.message);
      }
    });
  }
};
