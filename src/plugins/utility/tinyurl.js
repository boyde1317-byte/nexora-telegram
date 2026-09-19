/**
 * tinyurl.js — Shorten a long URL using TinyURL.
 *
 * Fixed: broken template literal in usage message.
 */
import { withReactionStatus } from '../../lib/cosmetics.js';
import { copyResultCard } from '../../lib/interactiveKit.js';

const URL_RE = /^https?:\/\/.{3,}/i;

export default {
  name: 'tinyurl',
  aliases: ['shorten', 'short', 'shorturl'],
  category: 'utility',
  description: 'Shortens a long URL using TinyURL. No API key required.',
  cooldown: 4000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    const url = args[0]?.trim();
    if (!url || !URL_RE.test(url)) {
      return await m.reply.info(
        `Usage: \`${p}tinyurl <url>\`\n\nExample: \`${p}tinyurl https://example.com/very/long/path?query=value\``,
        'URL SHORTENER'
      );
    }

    await withReactionStatus(m, async () => {
      try {
        const res = await fetch(
          `https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (!res.ok) throw new Error('TinyURL service unavailable.');
        const short = (await res.text()).trim();
        if (!short.startsWith('http')) throw new Error('Invalid response from TinyURL.');

        const text = `🔗 *URL SHORTENER*\n\nOriginal: ${url.length > 55 ? url.slice(0, 52) + '...' : url}\nShort: *${short}*`;
        try {
          await copyResultCard(sock, m.from, {
            text:       text,
            copyLabel:  '📋 Copy Short URL',
            copyValue:  short,
          }, { quoted: m });
        } catch (_) {
          await m.reply(text);
        }
      } catch (err) {
        await m.reply.error(`Failed to shorten URL: ${err.message}`);
      }
    });
  }
};
