/**
 * @file src/plugins/utility/get.js
 *
 * .get <url> [offset] — fetch a web page and return its raw HTML.
 *
 * Returns a 3500-char window of the page source (starting at [offset],
 * default 0) as plain text so the markup stays readable, plus the total
 * size so you can page through with further offsets.
 *
 * Usage:
 *   .get https://example.com          → first 3500 chars of the HTML
 *   .get https://example.com 3500     → next chunk (offset paging)
 *
 * Non-HTML responses (JSON, XML, plain text) are still returned, labeled
 * with their real content type. Internal/private network hosts are
 * blocked (SSRF guard).
 */

import { withReactionStatus } from '../../lib/cosmetics.js';

const CHUNK = 3500;               // chars per reply — keeps WhatsApp messages fast
const MAX_BYTES = 2 * 1024 * 1024; // don't pull more than 2MB into memory

const PRIVATE_HOST_RE =
  /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|::1|\[::1\]|172\.(1[6-9]|2\d|3[01])\.)/i;

const normalizeUrl = (raw) => {
  if (!raw) return null;
  let url = raw.trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (PRIVATE_HOST_RE.test(u.hostname)) return null;
    return u.toString();
  } catch (_) {
    return null;
  }
};

export default {
  name: 'get',
  aliases: ['fetchhtml', 'html'],
  category: 'utility',
  description: 'Fetch a website and return its raw HTML. Usage: .get <url> [offset]',
  cooldown: 6000,
  execute: async ({ m, args, prefix }) => {
    const p = prefix || '.';
    const url = normalizeUrl(args[0]);
    if (!url) {
      if (args[0] && PRIVATE_HOST_RE.test(args[0])) {
        return await m.reply.info('Internal/private network addresses are blocked.', 'GET HTML');
      }
      return await m.reply.info(
        `Usage: \`${p}get <url> [offset]\`\n\nExample: \`${p}get example.com\` — first 3500 chars\n\`${p}get example.com 3500\` — next chunk`,
        'GET HTML'
      );
    }

    const offset = Math.max(0, parseInt(args[1], 10) || 0);

    await withReactionStatus(m, async () => {
      const res = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      if (!res.ok) throw new Error(`Site returned HTTP ${res.status} ${res.statusText || ''}`.trim());

      const ctype = (res.headers.get('content-type') || '').split(';')[0].trim() || 'unknown';
      const body = (await res.text()).slice(0, MAX_BYTES);
      if (!body) throw new Error('The site returned an empty body.');

      const total = body.length;
      const chunk = body.slice(offset, offset + CHUNK);
      if (!chunk) {
        return await m.reply.info(
          `Offset ${offset} is past the end of the document (total ${total} chars).`,
          'GET HTML'
        );
      }

      const truncated = offset + chunk.length < total;
      const title = (chunk.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || '').trim();

      const header =
        `🌐 *${url}*\n` +
        `${ctype} • ${total.toLocaleString()} chars • showing ${offset}-${offset + chunk.length}` +
        (title ? `\n📄 ${title.slice(0, 80)}` : '');

      await m.reply(
        `${header}\n\n\`\`\`\n${chunk}\n\`\`\`${
          truncated ? `\n\n_More: \`${p}get ${url} ${offset + chunk.length}\`_` : '\n\n_Document fully shown._'
        }`
      );
    });
  },
};
