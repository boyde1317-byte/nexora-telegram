/**
 * richInbound.js — render WhatsApp rich-response payloads natively on Telegram.
 *
 * When a NEXORA plugin sends a rich message on WhatsApp, it hands the engine
 * a declarative payload: { headerText, contentText, footerText,
 * richResponse: [ {text} | {code} | {table} | {items} | {inlineImage} |
 * {gridImage} | {dynamic} … ] }. The Telegram commander's sock proxy
 * intercepts that payload BEFORE the Baileys fork converts it to proto —
 * so we can translate the same sections into Telegram-native output:
 *
 *   text        → HTML section (WhatsApp markdown converted)
 *   code        → monospace <pre> block
 *   table       → aligned monospace table block
 *   items       → title/text lines
 *   inlineImage → native photo
 *   gridImage   → Telegram media-group album
 *   dynamic     → photo/animation
 *
 * Anything unrecognised degrades to its text parts — never a crash.
 */

import { mdToHtml, esc, sendRich } from './rich.js';

/** True when the payload is a WhatsApp rich-response shape we can translate. */
export function hasRichPayload(content) {
  if (!content || typeof content !== 'object') return false;
  if (Array.isArray(content.richResponse) && content.richResponse.length) return true;
  if (Array.isArray(content.table) && content.table.length) return true;
  return false;
}

/** Aligned monospace table block from rows of items. */
function tableToPre(rows, title) {
  const grid = rows.map((r) => (Array.isArray(r?.items) ? r.items.map(String) : [].concat(r ?? []).map(String)));
  const colCount = Math.max(...grid.map((r) => r.length), 1);
  const widths = Array.from({ length: colCount }, (_, c) =>
    Math.max(...grid.map((r) => (r[c] ?? '').length), 3));
  const line = (r) => r.map((cell, c) => String(cell ?? '').padEnd(widths[c])).join(' │ ').trimEnd();
  const head = '┌' + widths.map((w) => '─'.repeat(w + 2)).join('┬') + '┐';
  const mid = '├' + widths.map((w) => '─'.repeat(w + 2)).join('┼') + '┤';
  const tail = '└' + widths.map((w) => '─'.repeat(w + 2)).join('┴') + '┘';
  const body = grid.map(line).join(`\n${mid}\n`);
  const block = `${head}\n${body}\n${tail}`;
  return (title ? `<b>${esc(title)}</b>\n` : '') + `<pre>${esc(block)}</pre>`;
}

/** Code block → <pre>, string or fork's [{codeContent}] shape. */
function codeToPre(sub) {
  const raw = Array.isArray(sub.code)
    ? sub.code.map((b) => (typeof b === 'string' ? b : b?.codeContent || '')).join('')
    : String(sub.code ?? '');
  const lang = sub.language ? `[${esc(sub.language)}]\n` : '';
  return `<pre>${lang}${esc(raw)}</pre>`;
}

/** Collect every image URL from a URL-or-{imageHighResUrl,imagePreviewUrl} shape. */
const imgUrls = (shape) => {
  if (!shape) return [];
  if (typeof shape === 'string') return shape.startsWith('http') ? [shape] : [];
  const u = shape.imageHighResUrl || shape.imagePreviewUrl || shape.sourceUrl;
  return u ? [u] : [];
};

/**
 * Translate and deliver. Sends ONE rich card for text/tables/code/items,
 * then photos/albums for the media sections (Telegram can't inline images
 * in text). Never throws — caller falls back to raw text on failure.
 */
export async function renderRichToTelegram(bot, chatId, content) {
  const sections = [];
  const media = [];

  if (content.headerText) sections.push({ text: `<b>${mdToHtml(content.headerText)}</b>` });
  if (content.contentText) sections.push({ text: mdToHtml(content.contentText) });

  const subs = Array.isArray(content.richResponse) ? content.richResponse : [];
  for (const sub of subs) {
    if (!sub) continue;
    if (sub.text) sections.push({ text: mdToHtml(sub.text) });
    else if (sub.code) sections.push({ text: codeToPre(sub) });
    else if (Array.isArray(sub.table) && sub.table.length) sections.push({ text: tableToPre(sub.table, sub.title) });
    else if (Array.isArray(sub.items) && sub.items.length) {
      const lines = sub.items
        .map((i) => `${i?.title ? `<b>${esc(i.title)}</b>` : ''}${i?.text ? `\n${mdToHtml(i.text)}` : ''}`)
        .filter(Boolean)
        .join('\n\n');
      if (lines) sections.push({ text: lines });
    } else if (sub.inlineImage) {
      media.push(...imgUrls(sub.inlineImage));
    } else if (sub.gridImage) {
      media.push(...imgUrls(sub.gridImage));
      if (Array.isArray(sub.gridImage?.imageUrls)) {
        for (const u of sub.gridImage.imageUrls) media.push(...imgUrls(u));
      }
    } else if (sub.dynamic?.url) {
      media.push(sub.dynamic.url);
    } else if (sub.inlineVideo?.videoUrl || sub.inlineVideo?.thumbnailUrl) {
      media.push(sub.inlineVideo.videoUrl || sub.inlineVideo.thumbnailUrl);
    }
  }

  // Flat single-table payloads (sendTable without the richResponse wrapper)
  if (Array.isArray(content.table) && content.table.length) {
    sections.push({ text: tableToPre(content.table, content.title || content.caption) });
  }

  const footer = content.footerText || undefined;

  if (sections.length) {
    await sendRich(bot, chatId, { sections, footer });
  }

  // Media after the text card — photos first, albums for 2+
  const urls = [...new Set(media)].filter((u) => u && u.startsWith('http')).slice(0, 10);
  if (urls.length === 1) {
    await bot.sendPhoto(chatId, urls[0]).catch(() => {});
  } else if (urls.length > 1) {
    await bot.sendMediaGroup(chatId, urls.map((u) => ({ type: 'photo', media: u }))).catch(() => {});
  }

  if (!sections.length && !urls.length) {
    // Nothing recognizable — let the caller fall back to plain text
    return false;
  }
  return true;
}

export default { hasRichPayload, renderRichToTelegram };
