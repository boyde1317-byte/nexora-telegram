/**
 * pinterest.js — Pinterest image search + direct download.
 *
 * Improvements:
 *  - DownloadProgress feedback
 *  - Error handling with user-friendly message
 *  - Direct image send to chat (not just links) — user gets actual images
 *  - Configurable result count: .pinterest <query> <count> (default 6, max 10)
 *  - Carousel of images, with per-image "Open Pin" buttons
 */
import { withReactionStatus} from '../../lib/cosmetics.js';

import { pinterestSearch} from '../../lib/downloader.js';
import { DownloadProgress} from '../../lib/progress.js';
import { sendMultiImageGallery } from '../../lib/richContent.js';

const DEFAULT_COUNT = 6;
const MAX_COUNT = 10;

export default {
  name: 'pinterest',
  aliases: ['pin', 'pindl'],
  category: 'download',
  description: 'Searches Pinterest and sends images directly. Usage: .pinterest <query> [count]',
  cooldown: 8000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';

    // Parse: last arg may be a count number
    let query = args.join(' ').trim();
    let count = DEFAULT_COUNT;

    const countMatch = query.match(/\s+(\d+)\s*$/);
    if (countMatch) {
      count = Math.min(parseInt(countMatch[1], 10), MAX_COUNT);
      query = query.replace(/\s+\d+\s*$/, '').trim();
    }

    if (!query) {
      return await m.reply.info(
        `Usage: \`${p}pinterest <search query> [count]\`\n\nExample: \`${p}pinterest minimalist wallpaper 3\`\nDefault: ${DEFAULT_COUNT} results (max ${MAX_COUNT})`,
        'PINTEREST SEARCH'
      );
    }

    await withReactionStatus(m, async () => {
      const progress = new DownloadProgress(sock, m.from, m);
      await progress.start(`Searching Pinterest for "${query}"`);
      try {
        const results = (await pinterestSearch(query)).slice(0, count);
        await progress.done(`✅ Found ${results.length} images. Sending...`);

        // NOTE: carouselMessage (baileysBridge.sendCarousel) is NOT used here —
        // relayMessage resolves successfully even when the recipient's WA
        // client can't render carouselMessage, so a try/catch around
        // sendCarousel never actually catches the failure. Sending each
        // image as a plain image message is the reliable path — every
        // WhatsApp client renders those.
        // ── Rich tier: stacked multi-image gallery (the .testrich
        //    v2multiimg primitive — generateMultiInlineImagesV2 with
        //    primitiveStyle: 'nixcode', same gallery .anime uses). Takes
        //    the first 4 pins; any pins beyond that are sent as plain
        //    images below so a big count still delivers everything. ──
        const GALLERY_LIMIT = 4;
        const gallerySent = await sendMultiImageGallery(sock, m.from, m, {
          images: results.map((pin) => ({
            imageUrl: pin.image,
            imageText: pin.title || pin.image,
          })),
          headerText: `📌 Pinterest — ${query}`.slice(0, 60),
          footer: 'NEXORA • Pinterest',
        });
        // Gallery shipped → deliver whatever it couldn't hold as plain
        // images; gallery skipped/failed (rich off) → plain send ALL.
        const remaining = gallerySent ? results.slice(GALLERY_LIMIT) : results;

        for (const pin of remaining) {
          try {
            await sock.sendMessage(m.from, {
              image: { url: pin.image },
              caption: pin.title || '',
            }, { quoted: m });
          } catch (imgErr) {
            console.warn('[pinterest] failed to send image:', imgErr.message);
          }
        }
      } catch (err) {
        await m.reply.error(`Pinterest search failed: ${err.message}`);
        throw err;
      }
    });
  }
};
