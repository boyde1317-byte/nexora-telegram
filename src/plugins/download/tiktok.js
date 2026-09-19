/**
 * tiktok.js — TikTok video downloader (no watermark).
 *
 * Improvements:
 *  - DownloadProgress feedback (was silent for 5-15s)
 *  - Error handling with user-friendly message
 *  - Author + duration metadata in caption
 *  - Rich tier: native reel player + stats card (falls back to classic video)
 */
import { withReactionStatus} from '../../lib/cosmetics.js';

import { tiktokDownload, isUrl} from '../../lib/downloader.js';
import { DownloadProgress} from '../../lib/progress.js';
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

        const meta = [
          data.title    ? `🎬 *${data.title}*`           : '🎬 TikTok Video',
          data.author   ? `👤 ${data.author}`             : null,
        ].filter(Boolean).join('\n');

        // The video is the actual deliverable — always send it as a real
        // playable attachment. The old "reel" primitive (Baileys'
        // generateReelWithStatsV2) puts the video behind a raw external
        // video_url inside an unproven GenAI reel_item block, which is a
        // Meta-AI-account content type, not a normal media message — on
        // device it rendered nothing at all for that section, just the
        // stats table below it, so the user got a table with no video.
        await sock.sendMessage(m.from, {
          video: { url: data.video },
          caption: `${meta}\n_No watermark_`,
        }, { quoted: m });

        // Stats card is a bonus follow-up, never a replacement — uses the
        // device-proven richTableCard (same primitive as .warns/.backup),
        // not the unproven reel block.
        await richTableCard(sock, m.from, {
          title: data.title || 'TikTok Video',
          headers: ['Metric', 'Value'],
          rows: [
            ['Author', (data.author || 'Unknown').slice(0, 40)],
            ['Quality', 'No watermark'],
            ['Source', 'TikTok'],
          ],
          footer: '© NEXORA-MD by Aizen',
        });
      } catch (err) {
        await m.reply.error(`TikTok download failed: ${err.message}`);
        throw err;
      }
    });
  }
};
