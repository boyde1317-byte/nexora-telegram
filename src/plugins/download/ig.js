/**
 * ig.js — Instagram post / reel / story downloader.
 *
 * Improvements:
 *  - DownloadProgress feedback (was silent during multi-item downloads)
 *  - Error handling with user-friendly message
 *  - Progress label shows "Item 2 of 5" during batch sends
 *  - Follow-up card with copy, open, and cross-platform buttons
 */
import { withReactionStatus} from '../../lib/cosmetics.js';
import { baileysBridge } from '../../core/baileysBridge.js';

import { instagramDownload, isUrl} from '../../lib/downloader.js';

/**
 * Sniff the real media type of a direct URL by fetching its first bytes.
 * The API returns token links (d.rapidcdn.app/...) with no file extension
 * and content-type application/octet-stream, so URL/extension heuristics
 * are useless — magic numbers are the only reliable signal.
 */
async function sniffIsVideo(url) {
  try {
    const r = await fetch(url, { headers: { Range: 'bytes=0-15' }, signal: AbortSignal.timeout(12000) });
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (ct.startsWith('video/')) return true;
    if (ct.startsWith('image/')) return false;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 12) return false;
    // mp4/mov: 'ftyp' box at offset 4
    if (buf.slice(4, 8).toString('ascii') === 'ftyp') return true;
    // webm/avi etc. ship video/* content-type above; images: FF D8 FF (jpeg),
    // 89 50 4E 47 (png), RIFF....WEBP (webp)
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return false;
    if (buf[0] === 0x89 && buf[1] === 0x50) return false;
    if (buf.slice(0, 4).toString('ascii') === 'RIFF') return false;
    return false;
  } catch (_) {
    // sniff failed — fall back to the legacy URL heuristic
    return /\.mp4(\?|$)/i.test(url);
  }
}
import { DownloadProgress} from '../../lib/progress.js';

export default {
  name: 'ig',
  aliases: ['instagram', 'igdl'],
  category: 'download',
  description: 'Downloads Instagram posts, reels, and stories. Usage: .ig <url>',
  cooldown: 8000,
  execute: async ({ m, sock, args, prefix }) => {
    const p   = prefix || '.';
    const url = args[0]?.trim();
    if (!url || !isUrl(url)) {
      return await m.reply.info(
        `Usage: \`${p}ig <url>\`\n\nExample: \`${p}ig https://www.instagram.com/p/xxxxxx/\``,
        'INSTAGRAM DOWNLOADER'
      );
    }

    await withReactionStatus(m, async () => {
      const progress = new DownloadProgress(sock, m.from, m);
      await progress.start('Fetching Instagram media');
      try {
        const items = await instagramDownload(url);
        const batch = items.slice(0, 10);
        await progress.done(`✅ Found ${batch.length} item${batch.length !== 1 ? 's' : ''}. Sending...`);

        // Sniff types up front so multi-image posts can ride one native
        // carousel instead of N sequential sends. Videos stay sequential —
        // carousel cards are image-only.
        const typed = [];
        for (const item of batch) {
          typed.push({ ...item, isVideo: await sniffIsVideo(item.url) });
        }
        const images = typed.filter(t => !t.isVideo);
        const videos = typed.filter(t => t.isVideo);

        if (images.length >= 2) {
          // ── Rich: swipeable carousel for the image items ──────────────
          try {
            await baileysBridge.sendCarousel(sock, m.from, {
              text: `📥 *Instagram* — ${images.length} image${images.length !== 1 ? 's' : ''}${videos.length ? ` + ${videos.length} video${videos.length !== 1 ? 's' : ''} below` : ''}\n\n_Swipe through the cards._`,
              cards: images.map((img, i) => ({
                caption: `📸 Item ${i + 1} of ${images.length}`,
                footer: `✦ ${images.length} image post`,
                image: { url: img.url },
              })),
            }, { quoted: m });
          } catch (err) {
            console.warn('[ig] carousel failed, sequential fallback:', err.message);
            for (const [i, img] of images.entries()) {
              await sock.sendMessage(m.from, {
                image: { url: img.url },
                caption: `📥 *Instagram Download* — Item ${i + 1} of ${images.length}`,
              }, { quoted: i === 0 ? m : undefined });
            }
          }
        } else {
          for (const [i, img] of images.entries()) {
            await sock.sendMessage(m.from, {
              image: { url: img.url },
              caption: '📥 *Instagram Download*',
            }, { quoted: m });
          }
        }

        // Videos can't ride the carousel — send them after it.
        for (const [i, vid] of videos.entries()) {
          await sock.sendMessage(m.from, {
            video: { url: vid.url },
            caption: `🎬 *Instagram Video* (${i + 1} of ${videos.length})`,
          }, { quoted: (images.length < 2 && i === 0) ? m : undefined });
        }
      } catch (err) {
        await m.reply.error(`Instagram download failed: ${err.message}`);
        throw err;
      }
    });
  }
};
