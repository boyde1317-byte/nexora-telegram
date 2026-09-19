/**
 * lyrics.js — Fetch song lyrics.
 *
 * Fixed: added error handling (was unhandled — crashes on API failure).
 */
import { withReactionStatus } from '../../lib/cosmetics.js';
import { actionCardWithAd, mixedCard } from '../../lib/interactiveKit.js';
import { getBrandThumbnail } from '../../lib/cosmetics.js';
import { getLyrics } from '../../lib/downloader.js';

export default {
  name: 'lyrics',
  aliases: ['lyric'],
  category: 'utility',
  description: 'Fetch song lyrics. Usage: .lyrics <artist> - <title>',
  cooldown: 6000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    const query = args.join(' ').trim();
    if (!query || !query.includes('-')) {
      return await m.reply.info(
        `Usage: \`${p}lyrics <artist> - <title>\`\n\nExample: \`${p}lyrics Coldplay - Yellow\``,
        'LYRICS'
      );
    }

    await withReactionStatus(m, async () => {
      try {
        const [artist, ...rest] = query.split('-');
        const title = rest.join('-').trim();
        const lyrics = await getLyrics(artist.trim(), title);

        if (!lyrics || !lyrics.trim()) {
          throw new Error('No lyrics found for that song. Check the artist and title.');
        }

        const trimmed = lyrics.length > 3500 ? `${lyrics.slice(0, 3500)}\n\n… (truncated)` : lyrics;
        const thumbnailUrl = await getBrandThumbnail();
        const searchUrl = `https://genius.com/search?q=${encodeURIComponent(`${artist.trim()} ${title}`)}`;
        try {
          await actionCardWithAd(sock, m.from, { text: trimmed }, [
            { label: '🎵 Play This Song', cmd: `${p}play ${artist.trim()} ${title}` },
          { label: '🎵 Search Another', cmd: `${p}lyrics` },
          { label: '🎤 Artist Info',     cmd: `${p}artist ${artist.trim()}` },
          ], {
            title:    `🎵 ${title.toUpperCase()}`,
            body:     `by ${artist.trim()}`,
            sourceUrl: searchUrl,
            thumbnailUrl,
            originalImageUrl: thumbnailUrl,
            renderLargerThumbnail: false,
          }, { quoted: m });
        } catch (_) {
          await m.reply(`🎵 *${title}* by ${artist.trim()}\n\n${trimmed}`);
        }
      } catch (err) {
        await m.reply.error(`Failed to fetch lyrics: ${err.message}`);
      }
    });
  }
};
