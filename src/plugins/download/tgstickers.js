/**
 * tgstickers.js — Download a Telegram sticker pack as WhatsApp stickers.
 *
 * Usage:
 *   .tgs https://t.me/addstickers/PackName      → send the whole pack (capped)
 *   .tgs PackName                                → same, by short name
 *   .tgs PackName 10                             → send only the first 10
 *
 * Requires a Telegram bot token (any @BotFather token; bots can read any
 * public sticker set): set TELEGRAM_BOT_TOKEN or TG_BOT_TOKEN in the
 * service environment.
 *
 * Sticker types:
 *   • static (.webp)   → forwarded as-is (512px webp, WhatsApp-native)
 *   • video (.webm)    → converted to animated webp via ffmpeg
 *   • animated (.tgs)  → Lottie vector, cannot be converted without a
 *     Lottie renderer — skipped and counted in the summary.
 */

import { Sticker, StickerTypes } from 'wa-sticker-formatter';
import brand from '../../../config/brand.js';
import { DownloadProgress } from '../../lib/progress.js';
import { mixedCard } from '../../lib/interactiveKit.js';

const DEFAULT_COUNT = 20;
const MAX_COUNT = 30;
const SEND_DELAY_MS = 800; // anti-flood pacing between WhatsApp sends
const FETCH_TIMEOUT_MS = 20000;

function botToken() {
  return process.env.TELEGRAM_BOT_TOKEN || process.env.TG_BOT_TOKEN || '';
}

/** Extract the pack short name from a t.me link or a bare name. */
function extractSetName(input) {
  const link = input.match(/t\.me\/(?:addstickers|stickers)\/([A-Za-z0-9_]+)/i);
  if (link) return link[1];
  const bare = input.match(/^([A-Za-z0-9_]{1,64})$/);
  if (bare) return bare[1];
  return null;
}

/** Telegram Bot API call with error surfacing. */
async function tgApi(token, method, params = {}) {
  const url = new URL(`https://api.telegram.org/bot${token}/${method}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  const json = await res.json().catch(() => null);
  if (!json) throw new Error('Telegram API returned a non-JSON response');
  if (!json.ok) {
    const desc = json.description || 'unknown Telegram API error';
    if (json.parameters?.retry_after) throw new Error(`rate limited, retry in ${json.parameters.retry_after}s`);
    throw new Error(desc);
  }
  return json.result;
}

/** Download one sticker file bytes via getFile. */
async function downloadStickerFile(token, fileId) {
  const file = await tgApi(token, 'getFile', { file_id: fileId });
  if (!file?.file_path) throw new Error('file_path missing from getFile');
  const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`file download failed (${res.status})`);
  return { buffer: Buffer.from(await res.arrayBuffer()), filePath: file.file_path };
}

/** Convert to a WhatsApp-ready sticker buffer. */
async function toWhatsappSticker(buffer, emoji) {
  const sticker = new Sticker(buffer, {
    pack: brand.name,
    author: brand.creator,
    type: StickerTypes.FULL,
    quality: 70,
    ...(emoji ? { categories: [emoji] } : {}),
  });
  return sticker.toBuffer();
}

export default {
  name: 'tgstickers',
  aliases: ['tgs', 'tgsticker', 'stickerpack'],
  category: 'download',
  description: 'Download a Telegram sticker pack as WhatsApp stickers. Usage: .tgs <t.me/addstickers link or name> [count]',
  cooldown: 10000,

  execute: async ({ sock, m, args, prefix }) => {
    const p = prefix || '.';
    const token = botToken();

    if (!token) {
      return await m.reply.error(
        `🚫 *Telegram sticker downloads need a bot token*\n\n` +
        `Add \`TELEGRAM_BOT_TOKEN\` (or \`TG_BOT_TOKEN\`) to the service environment — any @BotFather token works, bots can read all public sticker packs.\n\n` +
        `Usage stays: \`${p}tgs https://t.me/addstickers/PackName [count]\``
      );
    }

    const raw = args.join(' ').trim();
    if (!raw) {
      return await mixedCard(sock, m.from, {
        text: `📥 *Telegram Sticker Downloader*\n\nSend me a public sticker pack link or name:\n\n• \`${p}tgs https://t.me/addstickers/PackName\`\n• \`${p}tgs PackName\`\n• \`${p}tgs PackName 10\` — limit the count\n\nStatic and video stickers are delivered; Lottie (.tgs) packs are skipped.`,
        footer: brand.name + ' • Telegram Stickers',
      }, [], { quoted: m });
    }

    // optional trailing count
    let count = DEFAULT_COUNT;
    let nameInput = raw;
    const countMatch = raw.match(/\s+(\d{1,3})\s*$/);
    if (countMatch) {
      count = Math.max(1, Math.min(parseInt(countMatch[1], 10), MAX_COUNT));
      nameInput = raw.replace(/\s+\d{1,3}\s*$/, '').trim();
    }

    const setName = extractSetName(nameInput);
    if (!setName) {
      return await m.reply.error(
        `❌ That doesn't look like a sticker pack.\n\nUse a link like \`https://t.me/addstickers/PackName\` or just the pack name.`,
      );
    }

    const progress = new DownloadProgress(sock, m.from, m, { intervalMs: 4000 });
    await progress.start(`Fetching sticker pack ${setName}`);

    let pack;
    try {
      pack = await tgApi(token, 'getStickerSet', { name: setName });
    } catch (err) {
      const msg = String(err.message || err);
      if (/STICKERSET_INVALID|not found/i.test(msg)) {
        return await m.reply.error(`❌ Sticker pack \`${setName}\` doesn't exist (or isn't public).`);
      }
      return await m.reply.error(`Telegram API error: ${msg}`);
    }

    const stickers = pack.stickers || [];
    if (!stickers.length) {
      return await m.reply.error(`❌ Sticker pack \`${pack.title || setName}\` is empty.`);
    }

    const toSend = stickers.slice(0, count);
    let sent = 0;
    let skippedLottie = 0;
    let failed = 0;

    await m.reply.info(
      `🎞️ *${pack.title || setName}* — ${stickers.length} sticker(s), sending ${toSend.length}${stickers.length > toSend.length ? ` (use \`${p}tgs ${setName} <count>\` for more)` : ''}`
    );

    for (const sticker of toSend) {
      // Lottie (vector) packs can't be rasterized without a Lottie renderer
      if (sticker.is_animated && !sticker.is_video) {
        skippedLottie += 1;
        continue;
      }
      try {
        await progress.start(`Converting sticker ${sent + 1}/${toSend.length}`);
        const { buffer } = await downloadStickerFile(token, sticker.file_id);
        const stickerBuffer = await toWhatsappSticker(buffer, sticker.emoji);
        await sock.sendMessage(m.from, { sticker: stickerBuffer }, { quoted: m });
        sent += 1;
        // pace the sends so WhatsApp doesn't throttle the session
        await new Promise((r) => setTimeout(r, SEND_DELAY_MS));
      } catch (err) {
        failed += 1;
        console.warn('[tgstickers] one sticker failed:', err?.message || err);
      }
    }

    if (sent === 0 && failed > 0) {
      return await m.reply.error(`❌ Couldn't deliver any stickers from \`${pack.title || setName}\` (${failed} failed). Check the server logs.`);
    }

    const parts = [`✅ Sent ${sent} sticker(s) from *${pack.title || setName}*`];
    if (skippedLottie) parts.push(`⏭️ ${skippedLottie} Lottie (animated vector) sticker(s) skipped — WhatsApp only takes webp`);
    if (failed) parts.push(`⚠️ ${failed} failed mid-transfer`);
    if (stickers.length > toSend.length) parts.push(`📦 ${stickers.length - toSend.length} more in the pack — \`${p}tgs ${setName} ${MAX_COUNT}\` for the rest`);
    return await m.reply.success(parts.join('\n'));
  },
};
