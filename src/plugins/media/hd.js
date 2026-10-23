/**
 * hd.js — image enhancer / upscaler (ported from OURIN DELUXE V3.4.1
 * tools/hd.js, ihancer.com API, verified keyless).
 *
 * Reply to an image (or send one with the caption .hd) to upscale and
 * denoise it. Returns the enhanced image directly.
 */
import { withReactionStatus } from '../../lib/cosmetics.js';

/**
 * Enhance an image buffer through ihancer.com's public API.
 * method: 1 = quality enhance, higher methods exist server-side but 1 is
 * the stable keyless path OURIN ships with.
 */
export async function enhanceImage(imageBuffer, method = 1) {
  const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
  const form = new FormData();
  form.set('method', String(method));
  form.set('is_pro_version', 'true');
  form.set('is_enhancing_more', 'false');
  form.set('max_image_size', 'high');
  form.set('file', blob, 'file.jpg');

  const res = await fetch('https://ihancer.com/api/enhance', {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
      Referer: 'https://ihancer.com/app/',
    },
    body: form,
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`ihancer returned HTTP ${res.status}.`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 1024) throw new Error('enhancer returned an empty image.');
  return buffer;
}

export default {
  name: 'hd',
  aliases: ['remini', 'enhance', 'upscale'],
  category: 'media',
  description: '🖼️ Upscale and enhance an image. Reply to an image with .hd',
  cooldown: 10_000,

  execute: async ({ m, sock, prefix }) => {
    const p = prefix || '.';
    const hasImage = m.type === 'imageMessage';
    const quotedImage = m.quoted && m.quoted.type === 'imageMessage';

    if (!hasImage && !quotedImage) {
      return await m.reply.info(
        `Upscales and sharpens an image.\n\nReply to an image with \`${p}hd\`, or send an image with the caption \`${p}hd\`.`,
        'HD IMAGE'
      );
    }

    await withReactionStatus(m, async () => {
      try {
        const buffer = hasImage ? await m.download() : await m.quoted.download();
        if (!buffer || buffer.length === 0) {
          return await m.reply.error('Could not download the image — it may have expired.');
        }
        const enhanced = await enhanceImage(buffer);
        await sock.sendMessage(m.from, {
          image: enhanced,
          caption: `✅ *ENHANCED* — upscaled and denoised.`,
        }, { quoted: m });
      } catch (err) {
        console.error('[hd]', err.message);
        return await m.reply.error(`Enhancement failed: ${err.message}`);
      }
    });
  },
};
