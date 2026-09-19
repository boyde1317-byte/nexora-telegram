import { webClient } from '../../lib/webClient.js';
import { copyResultCard, mixedCard } from '../../lib/interactiveKit.js';

export default {
  name: 'artist',
  aliases: ['singer', 'band'],
  category: 'media',
  description: 'Search for an artist on iTunes.',
  cooldown: 5000,
  execute: async ({ m, sock, args, prefix }) => {
    const query = args.join(' ').trim();
    if (!query) {
      return await m.reply.info(`Usage: \`${prefix}artist <name>\``, 'ARTIST LOOKUP');
    }

    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=musicArtist&limit=1`;
      const { data } = await webClient.fetch(url, { useCache: true });

      if (!data.results || data.results.length === 0) {
        throw new Error('Artist not found.');
      }

      const artist = data.results[0];

      const text = `🎤 *ARTIST: ${artist.artistName}*\n\n` +
        `*Genre:* ${artist.primaryGenreName}\n` +
        `*Apple Music:* ${artist.artistLinkUrl}`;

      let msgOptions = { text };
      if (artist.artworkUrl100) {
        msgOptions = {
          image: { url: artist.artworkUrl100.replace('100x100', '600x600') },
          caption: text
        };
      }
      await sock.sendMessage(m.from, msgOptions, { quoted: m });

      try {
        await mixedCard(sock, m.from, {
          text: `🎤 Found *${artist.artistName}* on Apple Music. ✦`,
          footer: 'NEXORA • Artist Lookup',
        }, [
          { kind: 'action', label: '🎵 Play Songs',   cmd: `${prefix}play ${artist.artistName}` },
          { kind: 'action', label: '📝 Get Lyrics',   cmd: `${prefix}lyrics` },
          { kind: 'action', label: '🎤 Another Artist', cmd: `${prefix}artist` },
        ], { quoted: m });
      } catch (_) {}
    } catch (err) {
      await m.reply.error(`Failed to find artist: ${err.message}`);
    }
  }
};
