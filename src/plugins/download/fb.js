/**
 * fb.js — .fb <url> — Facebook video download.
 *
 * Rich tier (device-audited Moonson msfb replica): AIRich inline video
 * (addVideo, taps play natively in the reply) + description text +
 * tip, footer-branded. Fallback: classic video message with caption.
 */

import { withReactionStatus } from '../../lib/cosmetics.js';
import { facebookDownload, isUrl } from '../../lib/downloader.js';
import { DownloadProgress } from '../../lib/progress.js';
import { AIRich } from '../../lib/NIXCODE.js';
import capabilities from '../../core/capabilities.js';

export default {
  name: 'fb',
  aliases: ['facebook', 'fbdl'],
  category: 'download',
  description: 'Downloads a Facebook video. Usage: .fb <url>',
  cooldown: 8000,

  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    const url = args[0]?.trim();

    if (!url || !isUrl(url)) {
      return await m.reply.info(
        `Usage: \`${p}fb <facebook video url>\`\n\nExample: \`${p}fb https://www.facebook.com/watch/?v=123\``,
        'FACEBOOK DOWNLOADER'
      );
    }

    await withReactionStatus(m, async () => {
      const progress = new DownloadProgress(sock, m.from, m);
      await progress.start('Fetching Facebook video');
      try {
        const data = await facebookDownload(url);
        const best = data.hd || data.sd;
        const quality = data.hd ? 'HD' : 'SD';
        await progress.done(`✅ Got it! Sending ${quality} video...`);

        // ── Rich tier: Moonson msfb replica (inline video card) ──
        if (capabilities.richResponse && best) {
          try {
            await new AIRich(sock)
              .addVideo(`${best}|5`)
              .addText(
                '📝 **Description:**\nFacebook Video (' + quality + ')\n\n' +
                  '🔗 **Link:** ' + best
              )
              .addTip('_Tap the video to play_')
              .setFooter('© NEXORA-MD by Aizen')
              .send(m.from, { quoted: m });
            return;
          } catch (err) {
            console.warn('[fb] rich tier failed, sending classic:', err.message);
          }
        }

        await sock.sendMessage(m.from, {
          video: { url: best },
          caption: `🎬 *Facebook Video* (${quality})`,
        }, { quoted: m });
      } catch (err) {
        await m.reply.error(`Facebook download failed: ${err.message}`);
        throw err;
      }
    });
  },
};
