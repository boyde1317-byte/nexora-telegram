/**
 * twitter.js — X / Twitter video downloader.
 *
 * Improvements:
 *  - DownloadProgress feedback (was silent for 5-15s)
 *  - Error handling with user-friendly message
 *  - Copy + open + cross-platform follow-up card
 */
import { withReactionStatus} from '../../lib/cosmetics.js';
import { baileysBridge } from '../../core/baileysBridge.js';
import capabilities from '../../core/capabilities.js';
import { ASSET_URLS } from '../../assets/assetUrls.js';
import brand from '../../../config/brand.js';

import { twitterDownload, isUrl} from '../../lib/downloader.js';
import { DownloadProgress} from '../../lib/progress.js';

export default {
  name: 'twitter',
  aliases: ['x', 'twdl', 'xdl'],
  category: 'download',
  description: 'Downloads a video from an X/Twitter post. Usage: .twitter <url>',
  cooldown: 8000,
  execute: async ({ m, sock, args, prefix }) => {
    const p   = prefix || '.';
    const url = args[0]?.trim();
    if (!url || !isUrl(url)) {
      return await m.reply.info(
        `Usage: \`${p}twitter <url>\`\n\nExample: \`${p}twitter https://x.com/user/status/xxxxxx\``,
        'X / TWITTER DOWNLOADER'
      );
    }

    await withReactionStatus(m, async () => {
      const progress = new DownloadProgress(sock, m.from, m);
      await progress.start('Fetching X/Twitter video');
      try {
        const data = await twitterDownload(url);
        await progress.done('✅ Got it! Sending video...');

        const title = (data.title || 'X / Twitter Video').slice(0, 60);

        // ── Rich tier: 🎬 inline video + stats table (.testrich
        //    "v2vidtable" pattern, device-verified) — native reel player
        //    with a stats table beneath it in one card. ──
        if (capabilities.richResponse) {
          try {
            await baileysBridge.sendInlineVideoStats(sock, m.from, {
              video: {
                title:        title,
                thumbnailUrl: ASSET_URLS.thumbnail,
                videoUrl:     data.url,
              },
              tableHeaders: ['Metric', 'Value'],
              tableRows: [
                ['Source', 'X / Twitter'],
                ['Title',  title.slice(0, 28)],
                ['Type',   'Video (original)'],
              ],
              headerText: '🎬 X / Twitter Video',
              footer: brand.copyright || `© ${brand.name}`,
            }, { quoted: m });
            return;
          } catch (err) {
            console.warn('[twitter] inline video stats failed, plain fallback:', err.message);
          }
        }

        // ── Fallback: classic playable video attachment ─────────────────
        await sock.sendMessage(m.from, {
          video:   { url: data.url },
          caption: data.title ? `🎬 *${data.title}*` : '🎬 X / Twitter Video',
        }, { quoted: m });
      } catch (err) {
        await m.reply.error(`Twitter download failed: ${err.message}`);
        throw err;
      }
    });
  }
};
