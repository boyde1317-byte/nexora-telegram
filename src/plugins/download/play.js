import { withReactionStatus } from '../../lib/cosmetics.js';
import { mixedCard, selectMenu } from '../../lib/interactiveKit.js';
import { youtubeSearch, youtubeDownload, isUrl, downloadMediaBuffer, isPlausibleMedia } from '../../lib/downloader.js';

const MAX_RESULTS = 5;

export default {
  name: 'play',
  aliases: ['yta', 'ytmp3'],
  category: 'download',
  description: 'Search & download YouTube audio. Usage: .play <song name or YouTube URL>',
  cooldown: 8000,
  execute: async ({ m, sock, args, prefix }) => {
    const query = args.join(' ').trim();
    if (!query) {
      return await m.reply.info(
        `Usage: \`${prefix}play <song name or YouTube URL>\`\n\nExample: \`${prefix}play maroon 5 memories\``,
        'PLAY MUSIC'
      );
    }

    await withReactionStatus(m, async () => {
      // Direct URL — resolve straight to audio.
      if (isUrl(query)) {
        try {
          const data = await youtubeDownload(query);
          if (!data.mp3) throw new Error('No audio stream available for that video.');

          const metaParts = [
            `🎵 *${data.title || 'YouTube Audio'}*`,
            data.author ? `👤 ${data.author}` : null,
            data.duration ? `⏱️ ${data.duration}` : null,
            data.views ? `👁️ ${data.views}` : null,
          ].filter(Boolean).join('\n');

          // Send audio first, then a single metadata card with buttons.
          // WhatsApp can't combine audio + buttons in one message, so this
          // is the minimum: 2 messages (audio + card).
          //
          // The backend's mp3 URL is a short-lived token (c.ymcdn.org links
          // go 410 Gone quickly) — buffer it immediately, and if the token
          // already died, grab a fresh backend link and try once more.
          let audio;
          const grab = async (d) => {
            const { buffer, mimetype } = await downloadMediaBuffer(d.mp3, { timeoutMs: 90000 });
            // The CDN's content-type is sometimes missing/generic even on a
            // genuine audio stream, so we still fall back to audio/mpeg for
            // those — but never for a buffer that doesn't actually look like
            // media. That guard is what stops a "soft" error response (a 200
            // with an HTML/JSON body instead of real bytes) from being
            // shipped to WhatsApp as fake audio, which is what previously
            // showed up on-device as "this audio is not available because
            // something is wrong with the audio file".
            if (!isPlausibleMedia(buffer)) {
              throw new Error('the source returned something that is not audio — likely a dead or expired link');
            }
            return { buffer, mimetype: mimetype.startsWith('audio/') ? mimetype : 'audio/mpeg' };
          };
          try {
            audio = await grab(data);
          } catch (err) {
            console.warn('[play] stream token expired/invalid, refetching link:', err.message);
            audio = await grab(await youtubeDownload(query));
          }

          await sock.sendMessage(m.from, {
            audio: audio.buffer,
            mimetype: audio.mimetype,
            ptt: false,
          }, { quoted: m });

          return await mixedCard(sock, m.from, {
            text: metaParts,
            footer: 'NEXORA-MD • YouTube Audio',
          }, [
            { kind: 'url',    label: '▶️ Watch on YouTube', url: query },
            { kind: 'action', label: '🎬 Get Video',        cmd: `${prefix}ytmp4 ${query}` },
            { kind: 'action', label: '📝 Get Lyrics',       cmd: `${prefix}lyrics ${data.title || query}` },
            { kind: 'action', label: '🎵 Play Another',     cmd: `${prefix}play` },
          ], { quoted: m });
        } catch (err) {
          return await m.reply.error(`Couldn't download that audio: ${err.message}`);
        }
      }

      // Query — search and let the user pick. Single message (selectMenu).
      try {
        const results = (await youtubeSearch(query)).slice(0, MAX_RESULTS);

        // High-quality display image: first result's YouTube thumbnail
        // (hq720) as the card header, with its title as the header caption.
        // If it's missing, selectMenu falls back to the menu brand image.
        const top = results[0] || {};
        return await selectMenu(sock, m.from, {
          text: `🔎 Results for "${query}":`,
          title: (top.title || '').slice(0, 60) || 'YouTube Search',
          subtitle: [top.author, top.duration].filter(Boolean).join(' • '),
          thumbnail: top.thumbnail,
        }, '🎵 Pick a track', [
          {
            title: '🎵 Download Audio',
            rows: results.map((v, idx) => ({
              id: `${prefix}play ${v.url}`,
              title: `${idx + 1}. ${v.title}`.slice(0, 60),
              description: `${v.author || ''} • ${v.duration || ''}`,
            })),
          },
          {
            title: '🎬 Download Video',
            rows: results.map((v, idx) => ({
              id: `${prefix}ytmp4 ${v.url}`,
              title: `${idx + 1}. ${v.title}`.slice(0, 60),
              description: `${v.author || ''} • ${v.duration || ''}`,
            })),
          },
        ], [], { quoted: m });
      } catch (err) {
        return await m.reply.error(`Search failed: ${err.message}`);
      }
    });
  }
};
