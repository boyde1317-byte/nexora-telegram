/**
 * screenshot.js (.ss) — capture any website as an image.
 *
 * Powered by WordPress mshots via Providers.screenshot (which polls past
 * mshots' gray "generating…" placeholder so users get the real render).
 *
 * Usage:
 *   .ss example.com
 *   .ss https://example.com full   → tall capture (2400px)
 */
import { Providers } from '../../lib/webClient.js';

const URL_RE = /^(https?:\/\/)?([\w-]+(\.[\w-]+)+)(:\d+)?(\/[^\s]*)?$/i;

export default {
  name: 'screenshot',
  aliases: ['ss', 'ssweb', 'webshot'],
  category: 'web',
  description: 'Screenshot any website. Usage: .ss <url> [full]',
  cooldown: 8000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    const raw = args[0];
    if (!raw || !URL_RE.test(raw)) {
      return await m.reply.warn(`Send me a URL to capture.\n\nExample: \`${p}ss example.com\` or \`${p}ss youtube.com full\` for a tall capture.`);
    }

    const url = raw.startsWith('http') ? raw : `https://${raw}`;
    const wantFull = (args[1] || '').toLowerCase() === 'full';

    await m.react('⏳');
    try {
      const buffer = await Providers.screenshot(url, { tall: wantFull });
      if (!buffer?.length) throw new Error('empty response from renderer');

      await sock.sendMessage(m.from, {
        image: buffer,
        caption: `📸 *Screenshot*\n🔗 ${url}${wantFull ? '\n📏 Full-page capture' : ''}`,
      }, { quoted: m });
      await m.react('✅');
    } catch (err) {
      await m.react('❌');
      await m.reply.error(`Screenshot failed: ${err.message}`);
    }
  },
};
