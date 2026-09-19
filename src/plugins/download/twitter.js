/**
 * twitter.js — X / Twitter video downloader.
 *
 * Improvements:
 *  - DownloadProgress feedback (was silent for 5-15s)
 *  - Error handling with user-friendly message
 *  - Copy + open + cross-platform follow-up card
 */
import { withReactionStatus} from '../../lib/cosmetics.js';

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
