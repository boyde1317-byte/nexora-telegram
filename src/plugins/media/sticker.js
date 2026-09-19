import { Sticker, StickerTypes} from 'wa-sticker-formatter';

import brand from '../../../config/brand.js';
import { DownloadProgress} from '../../lib/progress.js';
import { mixedCard} from '../../lib/interactiveKit.js';

/**
 * sticker.js — Convert images/videos into WhatsApp stickers.
 *
 * Improvements:
 *  - Crop modes: .sticker crop (circle), .sticker full (default), .sticker stretch
 *  - Custom pack name: .sticker My Pack Name
 *  - Custom author: .sticker --author=MyName
 *  - Emoji overlay: .sticker 🎉
 *  - Better error messages with usage examples
 */
const CROP_KEYWORDS = ['crop', 'circle', 'rounded'];
const STRETCH_KEYWORDS = ['stretch', 'full', 'contain'];

function parseArgs(args) {
  const result = {
    packName: null,
    authorName: null,
    cropMode: StickerTypes.FULL,
    emoji: null,
  };

  for (const arg of args) {
    const lower = arg.toLowerCase();

    // --author=Name
    if (arg.startsWith('--author=')) {
      result.authorName = arg.slice(9);
      continue;
    }

    // --pack=Name (alternative)
    if (arg.startsWith('--pack=')) {
      result.packName = arg.slice(7);
      continue;
    }

    // --emoji=🎉
    if (arg.startsWith('--emoji=')) {
      result.emoji = arg.slice(8);
      continue;
    }

    // Crop modes
    if (CROP_KEYWORDS.includes(lower)) {
      result.cropMode = StickerTypes.CROPPED;
      continue;
    }
    if (STRETCH_KEYWORDS.includes(lower) && lower !== 'full') {
      result.cropMode = StickerTypes.FULL;
      continue;
    }

    // Bare emoji (single codepoint)
    if (/^\p{Extended_Pictographic}$/u.test(arg) && !result.emoji) {
      result.emoji = arg;
      continue;
    }

    // Otherwise it's pack name text
    if (!result.packName) {
      result.packName = arg;
    } else {
      result.packName += ' ' + arg;
    }
  }

  return result;
}

export default {
  name: 'sticker',
  aliases: ['s', 'wm', 'pack'],
  category: 'media',
  description: 'Convert image/video to sticker. Options: crop, emoji, custom pack name.',
  cooldown: 4000,
  execute: async ({ sock, m, args, prefix }) => {
    const p = prefix || '.';
    let mediaBuffer = null;
    let mediaType = null;

    if (m.type === 'imageMessage' || m.type === 'videoMessage') {
      mediaBuffer = await m.download();
      mediaType = m.type;
    } else if (m.quoted && (m.quoted.type === 'imageMessage' || m.quoted.type === 'videoMessage')) {
      mediaBuffer = await m.quoted.download();
      mediaType = m.quoted.type;
    }

    if (!mediaBuffer) {
      return await mixedCard(sock, m.from, {
        text: `❌ *No media found*\n\nSend an image or video with \`${p}sticker\` as the caption, or reply to an existing image/video.\n\n*Options:*\n• \`${p}sticker\` — full sticker (default)\n• \`${p}sticker crop\` — circular crop\n• \`${p}sticker 🎉\` — add emoji category\n• \`${p}sticker My Pack --author=Me\` — custom pack + author`,
        footer: 'NEXORA • Sticker Lab',
      }, [
        { kind: 'action', label: '📋 List Stickers', cmd: `${p}liststicker` },
        { kind: 'action', label: '🗑️ Delete Sticker', cmd: `${p}delsticker` },
      ], { quoted: m });
    }

    const parsed = parseArgs(args);
    const packName = parsed.packName || brand.name;
    const authorName = parsed.authorName || brand.creator;

    const progress = new DownloadProgress(sock, m.from, m, { intervalMs: 3000 });
    const isVideo = mediaType === 'videoMessage';
    await progress.start(isVideo ? 'Converting animated sticker' : 'Converting sticker');

    try {
      const sticker = new Sticker(mediaBuffer, {
        pack:    packName,
        author:  authorName,
        type:    parsed.cropMode,
        quality: isVideo ? 50 : 70,
        ...(parsed.emoji ? { categories: [parsed.emoji] } : {}),
      });

      const stickerBuffer = await sticker.toBuffer();
      await progress.done('');

      // Single message — the sticker itself is the complete response.
      // Removed follow-up mixedCard to prevent double messages.
      await sock.sendMessage(m.from, { sticker: stickerBuffer }, { quoted: m });
    } catch (err) {
      console.error('[PLUGIN ERROR] sticker conversion failed:', err);
      await m.reply.error(`Failed to create sticker: ${err.message}`);
    }
  }
};
