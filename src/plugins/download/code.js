/**
 * @file src/plugins/download/code.js
 *
 * .pull <url> [path] — pull a whole codebase from a link.
 * The heavy counterpart of .get: .get fetches a page's HTML, .pull
 * fetches files and archives and hands them back.
 *
 * Usage:
 *   .code https://github.com/octocat/Hello-World   → file tree of the repo
 *   .code <mediafire-or-zip-url>                   → file tree of the archive
 *   .code <url> README.md                          → sends that file as a document
 *   .code <url> package                            → unique substring match works
 *
 * Supports MediaFire pages (dkey chain), GitHub repo URLs (default-branch
 * zipball), direct .zip/.tar.gz, and any single-file URL (sent as a
 * document). Archives are unpacked in memory with hard caps (25MB download,
 * 80MB extracted, 3000 files) and cached for 10 minutes so follow-up file
 * requests don't re-download. Private-network hosts are blocked.
 */

import { withReactionStatus } from '../../lib/cosmetics.js';
import { richTableCard } from '../../lib/interactiveKit.js';
import { pullCode, findInCodebase } from '../../lib/codePull.js';

const MAX_ROWS = 24;                 // rows shown in the tree card

// extension → mimetype for the common text/code types we hand back
const MIME = {
  js: 'text/javascript', mjs: 'text/javascript', json: 'application/json',
  ts: 'text/plain', md: 'text/markdown', txt: 'text/plain', html: 'text/html',
  css: 'text/css', py: 'text/plain', sh: 'text/plain', yml: 'text/plain',
  yaml: 'text/plain', xml: 'application/xml', zip: 'application/zip',
  gz: 'application/gzip', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  pdf: 'application/pdf', mp4: 'video/mp4', mp3: 'audio/mpeg',
};

const fmtBytes = (n) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

export default {
  name: 'pull',
  aliases: ['codebase', 'srcpull'],
  category: 'download',
  description: 'Pull a whole codebase from a link (GitHub repo, MediaFire zip, or any file URL). Usage: .pull <url> [path]',
  cooldown: 10000,

  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    const usage = async () => await m.reply.info(
      `Usage: \`${p}pull <url> [file]\`\n\n` +
      `\`${p}pull github.com/user/repo\` — file tree of the repo\n` +
      `\`${p}pull <zip-or-mediafire-url>\` — file tree of the archive\n` +
      `\`${p}pull <url> <filename>\` — sends one file back as a document\n\n` +
      `Also takes any direct file URL (js/json/txt/...) straight to a document.`,
      'PULL CODE'
    );

    if (!args[0]) return usage();

    const url = args[0];
    const wanted = args.slice(1).join(' ').trim() || null;

    await withReactionStatus(m, async () => {
      const result = await pullCode(url);
      const srcLabel = result.fromCache ? 'cached' : 'downloaded';

      /* ── single file source → straight to a document ── */
      if (result.kind === 'file') {
        const name = (result.name || 'file').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || 'file';
        await sock.sendMessage(m.from, {
          document: Buffer.from(result.buf),
          fileName: name,
          mimetype: MIME[name.split('.').pop()?.toLowerCase()] || 'application/octet-stream',
        }, { quoted: m });
        return;
      }

      /* ── a specific file was requested from the codebase ── */
      if (wanted) {
        const hit = findInCodebase(result.files, wanted);
        if (!hit) {
          const tip = wanted.length > 3 ? '' : ' (try a longer, unique part of the path)';
          return await m.reply.error(`No file matching \`${wanted}\` in this codebase${tip}. Re-run \`${p}pull ${url}\` to see the file tree.`, 'PULL CODE');
        }
        const [path, data, allMatches] = hit;
        if (allMatches && allMatches.length > 1) {
          await m.reply(`Matched several files — sending \`${path}\`. Also possible:\n` +
            allMatches.slice(1, 6).map((c) => `• \`${c}\``).join('\n'));
        }
        const name = path.split('/').pop().replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || 'file';
        await sock.sendMessage(m.from, {
          document: Buffer.from(data),
          fileName: name,
          mimetype: MIME[name.split('.').pop()?.toLowerCase()] || 'application/octet-stream',
        }, { quoted: m });
        return;
      }

      /* ── no file requested → show the tree ── */
      const entries = [...result.files.entries()]
        .map(([path, data]) => ({ path, size: data.length }))
        .sort((a, b) => a.path.localeCompare(b.path));

      // keep visible-line budget sane: prefer source files, cap per-row path length
      const rows = entries.slice(0, MAX_ROWS).map((e) => [
        e.path.length > 42 ? '…' + e.path.slice(-41) : e.path,
        fmtBytes(e.size),
      ]);
      const rest = entries.length - rows.length;

      const title = `📦 ${result.name}`.slice(0, 60);
      const footer =
        `${entries.length} file${entries.length !== 1 ? 's' : ''} · ${fmtBytes(result.totalBytes)} · ${srcLabel}` +
        (rest > 0 ? `\n+ ${rest} more — pull with \`${p}pull ${url} <part-of-path>\`` : `\nPull a file: \`${p}pull ${url} <part-of-path>\``);

      if (entries.length <= 6 && rows.length) {
        // small codebases read fine as plain text
        await m.reply(
          `${title}\n\n` +
          rows.map((r) => `• \`${r[0]}\` — ${r[1]}`).join('\n') +
          `\n\n${footer}`
        );
      } else {
        await richTableCard(sock, m.from, {
          title,
          headers: ['File', 'Size'],
          rows,
          footerText: footer,
        }, m);
      }
    });
  },
};
