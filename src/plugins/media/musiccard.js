/**
 * @file src/plugins/media/musiccard.js
 * .musiccard — turns a photo into a Spotify-style now-playing card.
 *
 * Reply to any image with `.musiccard Title|Artist` (or send the image with
 * that caption). Rendered by the NEXORA Card Engine so it matches the rank
 * and level-up cards' brand language. If no image is attached, falls back
 * to a gradient cover so the command still works for title/artist fun.
 */

import { downloadMediaMessage } from 'baileys';
import { renderMusicCard } from '../../lib/cardEngine.js';
import { withReactionStatus } from '../../lib/cosmetics.js';
import { DownloadProgress } from '../../lib/progress.js';

function parseBrief(text) {
  const raw = (text || '').trim();
  if (!raw) return { title: 'Untitled Track', artist: 'Unknown Artist' };
  const [title, artist] = raw.split('|').map(s => s.trim());
  return { title: title || 'Untitled Track', artist: artist || 'Unknown Artist' };
}

export default {
  name: 'musiccard',
  aliases: ['mcard', 'nowplaying'],
  category: 'media',
  description: 'Turns a photo into a now-playing music card. Usage: .musiccard <Title>|<Artist> (reply to an image)',
  cooldown: 8000,
  execute: async ({ m, sock, args, prefix, rawMessage }) => {
    const p = prefix || '.';
    const brief = parseBrief(args.join(' '));

    await withReactionStatus(m, async () => {
      const progress = new DownloadProgress(sock, m.from, m);
      await progress.start('Rendering card');
      try {
        let coverBuffer = null;
        const isImage = m.msg?.mimetype?.includes('image') || m.quoted?.mimetype?.includes('image');
        if (isImage) {
          const targetMessage = m.quoted
            ? rawMessage.message.extendedTextMessage.contextInfo.quotedMessage
            : rawMessage.message;
          coverBuffer = await downloadMediaMessage(
            { key: m.quoted ? m.msg.contextInfo.stanzaId : m.key, message: targetMessage },
            'buffer',
            {},
            { logger: console, reuploadRequest: sock.updateMediaMessage },
          );
        }

        const card = await renderMusicCard({
          title: brief.title,
          artist: brief.artist,
          coverBuffer,
          requesterName: m.pushName || undefined,
        });

        await progress.done();
        await sock.sendMessage(m.from, {
          image: card,
          caption:
            `🎵 *${brief.title}* — _${brief.artist}_\n` +
            (isImage ? '' : `_(no image attached — used the gradient cover; reply to a photo for the real thing)_\n`) +
            `_${p}musiccard <Title>|<Artist>_`,
        }, { quoted: m });
      } catch (err) {
        await m.reply.error(`Could not render the music card: ${err.message}`);
        throw err;
      }
    });
  },
};
