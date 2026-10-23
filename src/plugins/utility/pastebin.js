/**
 * pastebin.js — create and read pastes on pastebin.com (ported from OURIN
 * DELUXE V3.4.1 tools/pastebin.js + tools/getpaste.js).
 *
 *   .pastebin <text or reply>            → create a paste (10 min expiry)
 *   .pastebin private <text>             → unlisted paste (1 week expiry)
 *   .getpaste <url or paste id>          → read a paste's raw content
 *
 * Uses pastebin.com's public API with the shared community dev key (same
 * one OURIN ships with). Fetch-based, AbortSignal timeouts.
 */
import { withReactionStatus } from '../../lib/cosmetics.js';

const API_KEY = 'h9WMT2Mn9QW-qDhvUSc-KObqAYcjI0he';

async function createPaste(text, { unlisted = false } = {}) {
  const body = new URLSearchParams({
    api_dev_key: API_KEY,
    api_option: 'paste',
    api_paste_code: text,
    api_paste_name: `NEXORA paste - ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
    api_paste_expire_date: unlisted ? '1W' : '10M',
    api_paste_private: unlisted ? '1' : '0',
  });
  const res = await fetch('https://pastebin.com/api/api_post.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`pastebin returned HTTP ${res.status}.`);
  const url = await res.text();
  if (!url.startsWith('https://pastebin.com/')) throw new Error(url.slice(0, 200));
  return url;
}

async function readPaste(link) {
  const id = link.replace(/.*pastebin\.com\//, '').replace(/^raw\//, '').trim();
  if (!/^[A-Za-z0-9]+$/.test(id)) throw new Error('Invalid paste id.');
  const res = await fetch(`https://pastebin.com/raw/${id}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`paste not found (HTTP ${res.status}).`);
  return { id, content: await res.text() };
}

export default {
  name: 'pastebin',
  aliases: ['getpaste', 'paste'],
  category: 'utility',
  description: '📋 Share long text/code via pastebin. Usage: .pastebin <text> / .getpaste <url>',
  cooldown: 8000,

  execute: async ({ m, sock, args, prefix, commandName }) => {
    const p = prefix || '.';
    await withReactionStatus(m, async () => {
      const mode = args[0]?.toLowerCase();

      // ── Read mode (.getpaste <url|id>) ───────────────────────────────
      if (mode && (commandName === 'getpaste' || mode.startsWith('http') || /^[A-Za-z0-9]{6,12}$/.test(mode) && args.length === 1)) {
        const link = args[0];
        if (!link) return await m.reply.warn(`Give me a paste link or id: \`${p}getpaste https://pastebin.com/xxxxxx\``);
        try {
          const { id, content } = await readPaste(link);
          const preview = content.length > 3800 ? content.slice(0, 3800) + '\n...' : content;
          return await m.reply(
            `📋 *PASTE ${id}*\n\n\`\`\`\`\n${preview.replace(/```\`\`\``/g, "'''")}\n\`\`\`\``
          );
        } catch (err) {
          return await m.reply.error(`Could not read that paste: ${err.message}`);
        }
      }

      // ── Create mode (.pastebin [private] <text or quoted message>) ────
      let text = args.join(' ');
      let unlisted = false;
      if (args[0]?.toLowerCase() === 'private') {
        unlisted = true;
        text = args.slice(1).join(' ');
      }
      if (!text && m.quoted?.text) text = m.quoted.text;
      if (!text) {
        return await m.reply.info(
          `Share long text or code as a link instead of flooding the chat.\n\n` +
          `\`${p}pastebin <text>\` — public paste, expires in 10 minutes\n` +
          `\`${p}pastebin private <text>\` — unlisted paste, lives 1 week\n` +
          `\`${p}getpaste <url>\` — read a paste back\n\n` +
          `You can also reply to a message with \`${p}pastebin\`.`,
          'PASTEBIN'
        );
      }
      if (text.length > 300_000) {
        return await m.reply.warn('Paste too large — pastebin allows up to ~300KB.');
      }

      try {
        const url = await createPaste(text, { unlisted });
        return await m.reply(
          `📋 *PASTE CREATED*\n\n${url}\n\n` +
          `${unlisted ? '🔒 Unlisted' : '🌍 Public'} · expires ${unlisted ? 'in 1 week' : 'in 10 minutes'}\n` +
          `_Read it back:_ \`${p}getpaste ${url.replace(/.*pastebin\.com\//, '')}\``
        );
      } catch (err) {
        return await m.reply.error(`Could not create the paste: ${err.message}`);
      }
    });
  },
};
