/**
 * @file src/plugins/download/b44.js
 *
 * .b44 <url> [url2 ...] — pull Base44-hosted files into a .zip archive.
 *
 * Specially crafted for the bot's own asset backend: files the bot (and its
 * Superagent workspace) host on Base44 —
 *   https://media.base44.com/images/public/<app>/<file>
 *   https://base44.app/api/apps/<app>/files/mp/public/<app>/<file>
 * can be pulled into one archive right from chat.
 *
 * Usage:
 *   .b44 <base44-file-url>            → that file, zipped
 *   .b44 <url> <url2> <url3>          → all of them in one .zip
 *   Reply with multiple lines of URLs → all of them in one .zip
 *
 * Base44 does not expose public directory listings, so it works from the
 * file links themselves (the ones already used across the bot's assets,
 * greetings and newsletters). Anything that is not a Base44 host is
 * rejected. Sizes are capped: 25MB per file, 80MB per archive.
 */

import { withReactionStatus } from '../../lib/cosmetics.js';
import { zipSync } from 'fflate';

const MAX_FILES = 15;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 80 * 1024 * 1024;
const UA = 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/120 Mobile';

const isBase44Url = (u) => {
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== 'https:') return false;
    if (parsed.hostname === 'media.base44.com') return true;
    if (parsed.hostname === 'base44.app' && /\/api\/apps\/[^/]+\/files\//.test(parsed.pathname)) return true;
    return false;
  } catch {
    return false;
  }
};

const fileNameFromUrl = (u) => {
  try {
    const tail = new URL(u).pathname.split('/').filter(Boolean).pop() || 'file';
    return decodeURIComponent(tail).slice(0, 90);
  } catch {
    return 'file';
  }
};

const fmtBytes = (n) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

export default {
  name: 'b44',
  aliases: ['base44', 'b44zip'],
  category: 'download',
  description: 'Pull Base44-hosted files into a .zip archive. Usage: .b44 <base44-file-url> [more urls...]',
  cooldown: 10000,

  execute: async ({ m, sock, text, args, prefix }) => {
    const p = prefix || '.';
    // accept urls from args, or from the quoted/replied message text (a list
    // of links pasted on several lines)
    let urls = args.map((a) => a.trim()).filter(Boolean);
    if (!urls.length && m.quoted?.text) {
      urls = (m.quoted.text.match(/https?:\/\/[^\s]+/g) || []);
    }

    const usage = async () => await m.reply.info(
      `Usage: \`${p}b44 <base44-file-url> [more urls...]\`\n\n` +
      `Pulls Base44-hosted files (media.base44.com / base44.app file links) into one \`.zip\` archive.\n` +
      `Up to ${MAX_FILES} files, ${fmtBytes(MAX_FILE_BYTES)} each. You can also reply to a message containing the links.`,
      'BASE44 PULL'
    );

    if (!urls.length) return usage();

    const bad = urls.filter((u) => !isBase44Url(u));
    if (bad.length) {
      return await m.reply.error(
        `Not a Base44 file link: ${bad.slice(0, 3).map((u) => `\`${u.slice(0, 60)}\``).join(', ')}` +
        (bad.length > 3 ? ` (+${bad.length - 3} more)` : '') +
        `\n\nThis command only accepts media.base44.com and base44.app/api/apps/<app>/files/ links.`,
        'BASE44 PULL'
      );
    }
    if (urls.length > MAX_FILES) urls = urls.slice(0, MAX_FILES);

    await withReactionStatus(m, async () => {
      const files = new Map();
      const failed = [];
      let total = 0;
      const usedNames = new Set();

      for (const url of urls) {
        let name = fileNameFromUrl(url);
        while (usedNames.has(name)) name = name.replace(/(\.[^.]*)?$/, `_$1`); // dedupe
        usedNames.add(name);
        try {
          const res = await fetch(url, {
            redirect: 'follow',
            signal: AbortSignal.timeout(45000),
            headers: { 'User-Agent': UA },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buf = Buffer.from(await res.arrayBuffer());
          if (!buf.length) throw new Error('empty file');
          if (buf.length > MAX_FILE_BYTES) throw new Error(`too big (${fmtBytes(buf.length)})`);
          total += buf.length;
          if (total > MAX_TOTAL_BYTES) throw new Error('archive cap reached');
          files.set(name, new Uint8Array(buf));
        } catch (e) {
          failed.push(`${name} — ${e.message}`);
        }
      }

      if (!files.size) {
        throw new Error(`Could not pull any file.\n${failed.join('\n')}`.slice(0, 600));
      }

      // zipSync takes a plain { name: bytes } object, not a Map
      const zip = Buffer.from(zipSync(Object.fromEntries(files), { level: 6 }));
      const stamp = new Date().toISOString().slice(5, 16).replace(/[-:T]/g, '');
      const zipName = `base44-${files.size}file${files.size !== 1 ? 's' : ''}-${stamp}.zip`;

      await sock.sendMessage(m.from, {
        document: zip,
        fileName: zipName,
        mimetype: 'application/zip',
      }, { quoted: m });

      const note = failed.length
        ? `\n⚠️ ${failed.length} file(s) skipped:\n` + failed.slice(0, 4).map((f) => `• ${f}`).join('\n')
        : '';
      await m.reply(`📦 \`${zipName}\` — ${files.size} file${files.size !== 1 ? 's' : ''}, ${fmtBytes(total)} (zipped to ${fmtBytes(zip.length)})${note}`);
    });
  },
};
