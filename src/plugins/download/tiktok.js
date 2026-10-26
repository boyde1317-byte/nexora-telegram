/**
 * tiktok.js — TikTok video downloader (no watermark).
 *
 * Improvements:
 *  - DownloadProgress feedback (was silent for 5-15s)
 *  - Error handling with user-friendly message
 *  - Rich tier: native reel player + stats table (testrich "reelstats"
 *    pattern — device-verified via .testrich). Falls back to the classic
 *    playable video message when the rich card can't be sent.
 */
import { withReactionStatus } from '../../lib/cosmetics.js';
import { tiktokDownload, isUrl } from '../../lib/downloader.js';
import { DownloadProgress } from '../../lib/progress.js';
import { sendReelWithStatsCard, sendMediaCarousel } from '../../lib/richContent.js';
import { richTableCard } from '../../lib/interactiveKit.js';

export default {
  name: 'tiktok',
  aliases: ['tt', 'ttdl'],
  category: 'download',
  description: 'Downloads a TikTok video without the watermark. Usage: .tiktok <url>',
  cooldown: 8000,

  execute: async ({ m, sock, args, prefix }) => {
    const p   = prefix || '.';
    const url = args[0]?.trim();
    if (!url || !isUrl(url)) {
      return await m.reply.info(
        `Usage: \`${p}tiktok <url>\`\n\nExample: \`${p}tiktok https://vt.tiktok.com/xxxxxx\``,
        'TIKTOK DOWNLOADER'
      );
    }

    await withReactionStatus(m, async () => {
      const progress = new DownloadProgress(sock, m.from, m);
      await progress.start('Fetching TikTok video');
      try {
        const data = await tiktokDownload(url);
        await progress.done('✅ Got it! Sending video...');

        const rows = [
          ['Author',  (data.author || 'Unknown').slice(0, 40)],
          ['Quality', 'HD • No watermark'],
          ['Audio',   data.audio ? 'Available (MP3)' : '—'],
          ['Source',  'TikTok'],
        ];

        // ── Photo-post tier: 📸 native swipeable carousel (ported from ──
        // Yorumi-MD's TikTok photo dump view). Each slide is its own card
        // with an "Open photo" button; falls back to plain image sends.
        if (data.images?.length) {
          await progress.done(`✅ Got it! ${data.images.length} photo${data.images.length > 1 ? 's' : ''}. Sending carousel...`);

          const sent = await sendMediaCarousel(sock, m.from, m, {
            title: `📸 ${(data.title || 'TikTok Photo Post').slice(0, 80)}`,
            images: data.images.map((u, i) => ({ url: u, title: `Slide ${i + 1}` })),
            footer: '© NEXORA-MD by Aizen',
          });
          if (sent) return;

          for (const [i, u] of data.images.slice(0, 5).entries()) {
            await sock.sendMessage(m.from, {
              image: { url: u },
              ...(i === 0 ? { caption: `📸 ${(data.title || 'TikTok Photo Post').slice(0, 80)}\n${data.author ? '👤 ' + data.author : ''}` } : {}),
            }, { quoted: m });
          }
          return;
        }

        // ── Rich tier: 🎬 Reel + Stats Table (.testrich reelstats) ──
        // Native reel player with the stats table beneath it, one card.
        // Replaces the old two-message video + richTableCard combo.
        const sent = await sendReelWithStatsCard(sock, m.from, m, {
          reel: {
            title:        (data.title || 'TikTok Video').slice(0, 60),
            thumbnailUrl: data.thumbnail,
            videoUrl:     data.video,
          },
          tableHeaders: ['Metric', 'Value'],
          tableRows: rows,
          headerText: '🎬 TikTok Downloader',
          footer: '© NEXORA-MD by Aizen',
        });
        if (sent) return;

        // ── Fallback: classic playable video attachment ─────────────────
        // The video is the actual deliverable — never leave the user with
        // a table and no playable file.
        const meta = [
          data.title  ? `🎬 *${data.title}*` : '🎬 TikTok Video',
          data.author ? `👤 ${data.author}` : null,
        ].filter(Boolean).join('\n');

        await sock.sendMessage(m.from, {
          video: { url: data.video },
          caption: `${meta}\n_No watermark_`,
        }, { quoted: m });

        await richTableCard(sock, m.from, {
          title: data.title || 'TikTok Video',
          headers: ['Metric', 'Value'],
          rows,
          footer: '© NEXORA-MD by Aizen',
        });
      } catch (err) {
        await m.reply.error(`TikTok download failed: ${err.message}`);
        throw err;
      }
    });
  }
};
