import { Providers, webClient } from '../../lib/webClient.js';
import { copyResultCard, mixedCard } from '../../lib/interactiveKit.js';

export default {
  name: 'movie',
  aliases: ['imdb', 'omdb'],
  category: 'media',
  description: 'Lookup movie or series information.',
  cooldown: 5000,
  execute: async ({ m, sock, args, prefix }) => {
    const query = args.join(' ').trim();
    if (!query) {
      return await m.reply.info(`Usage: \`${prefix}movie <title>\``, 'MOVIE LOOKUP');
    }

    try {
      const apiKey = process.env.OMDB_API_KEY;
      if (!apiKey) return await m.reply.error('OMDB_API_KEY is not configured in .env');

      const url = `http://www.omdbapi.com/?t=${encodeURIComponent(query)}&apikey=${apiKey}`;
      const { data } = await webClient.fetch(url, { useCache: true });

      if (data.Response === 'False') {
        throw new Error(data.Error);
      }

      const ratings = data.Ratings
        ? data.Ratings.map(r => `${r.Source === 'Internet Movie Database' ? 'IMDb' : r.Source}: ${r.Value}`).join(' | ')
        : `IMDb: ${data.imdbRating}/10`;

      const text = `🎬 *${data.Title} (${data.Year})*\n\n` +
        `⭐ ${data.imdbRating}/10 | ⏱️ ${data.Runtime} | 📅 ${data.Released}\n` +
        `🎭 ${data.Genre}\n` +
        `🎬 Dir: ${data.Director}\n` +
        `🌟 Cast: ${data.Actors}\n` +
        `🏆 ${data.Awards !== 'N/A' ? data.Awards : 'No awards listed'}\n\n` +
        `${data.Plot}`;

      let msgOptions = { text };
      if (data.Poster && data.Poster !== 'N/A') {
        msgOptions = {
          image: { url: data.Poster },
          caption: text
        };
      }

      await sock.sendMessage(m.from, msgOptions, { quoted: m });

      try {
        await mixedCard(sock, m.from, {
          text: `🎬 Found *${data.Title}*. Want more?`,
          footer: 'NEXORA • Movie DB',
        }, [
          { kind: 'action', label: '🎵 Find Soundtrack',  cmd: `${prefix}play ${data.Title} soundtrack` },
          { kind: 'action', label: '🎬 Another Movie',   cmd: `${prefix}movie` },
          { kind: 'action', label: '📺 Search TV',       cmd: `${prefix}movie` },
        ], { quoted: m });
      } catch (_) {}
    } catch (err) {
      await m.reply.error(`Failed to find movie: ${err.message}`);
    }
  }
};
