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
 *
 * ── PROTO PATH (generated cards) ─────────────────────────────────────────
 * Plugins that relay GENERATED proto (.testrich generators, AIRich/Moonson
 * combos, map cards) bypass the declarative intercept — their payload is a
 * richResponseMessage (V1 submessages or V2 base64 unifiedResponse) possibly
 * wrapped in botForwardedMessage. hasRichProtoMessage() detects those shapes
 * and renderRichProtoToTelegram() decodes them via baileysBridge.parseRichMessage
 * and builds the same Telegram-native rich card: markdown sections, monospace
 * tables, <pre> code, tap-able links, photos/albums for image sections.
 *
 * Anything unrecognised degrades to its text parts — never a crash.
 */

import { mdToHtml, esc, sendRich } from './rich.js';
import baileysBridge from '../core/baileysBridge.js';

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
  const line = (r) => '│' + r.map((cell, c) => ' ' + String(cell ?? '').padEnd(widths[c]) + ' ').join('│') + '│';
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


/** True when a relayed proto payload is a WhatsApp rich-response message
 *  (bare richResponseMessage or wrapped in botForwardedMessage). */
export function hasRichProtoMessage(content) {
  if (!content || typeof content !== 'object') return false;
  if (content.richResponseMessage) return true;
  if (content.botForwardedMessage?.message?.richResponseMessage) return true;
  return false;
}

/**
 * Build a rich Telegram card from a relayed WhatsApp rich proto —
 * V1 (submessages) or V2 (base64 unifiedResponse), bare or wrapped in
 * botForwardedMessage. Uses parseRichMessage's typed sections, so the
 * card gets real tables, code blocks, tap-able links and photos —
 * not the plain-text fallback. Returns true when something rendered.
 */
export async function renderRichProtoToTelegram(bot, chatId, message) {
  if (!bot || !chatId || !message) return false;
  // Normalize: bare { richResponseMessage } → wrapped shape parseRichMessage expects
  const candidate = message.richResponseMessage && !message.botForwardedMessage
    ? { botForwardedMessage: { message } }
    : message;
  const parsed = baileysBridge.parseRichMessage(candidate);
  if (!parsed.isRich) return false;

  const sections = [];
  const media = [];

  for (const s of parsed.sections || []) {
    switch (s.type) {
      case 'text':
        if (s.content) sections.push({ text: mdToHtml(s.content) });
        break;
      case 'table': {
        // rows arrive as arrays, { items } or { cells } depending on V1/V2
        const rows = (s.rows || []).map((r) =>
          Array.isArray(r) ? r : (r?.items || r?.cells || [r]));
        const filled = rows.filter((r) => r.length);
        if (filled.length) sections.push({ text: tableToPre(filled, s.title) });
        break;
      }
      case 'code':
        if (s.code) sections.push({ text: codeToPre({ code: s.code, language: s.language }) });
        break;
      case 'links': {
        const parts = [];
        if (s.text) parts.push(mdToHtml(s.text));
        for (const l of s.links || []) {
          const url = l?.url || '';
          const label = esc(l?.title || l?.display_text || url);
          if (url) parts.push(url.startsWith('http') ? `<a href="${esc(url)}">${label}</a>` : `<code>${label}</code>`);
        }
        if (parts.length) sections.push({ text: parts.join('\n') });
        break;
      }
      case 'inlineImage':
        if (s.url) media.push(s.url);
        break;
      case 'gridImage': {
        const urls = imgUrls(s.mainUrl);
        media.push(...urls);
        break;
      }
      case 'dynamic':
        if (s.url) media.push(s.url);
        break;
      case 'map': {
        const lat = Number(s.lat), lng = Number(s.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          try { await bot.sendLocation(chatId, lat, lng); } catch { /* best-effort pin */ }
        }
        const annot = (s.annotations || []).filter(Boolean).join(', ');
        sections.push({ text: `📍 Map: <code>${esc(lat)},${esc(lng)}</code>${annot ? ` — ${esc(annot)}` : ''}` });
        break;
      }
      case 'latex': {
        const parts = [];
        if (s.text) parts.push(mdToHtml(s.text));
        for (const e of s.expressions || []) {
          const tex = e?.latexExpression || e?.latex_expression || e?.latex || '';
          if (tex) parts.push(`<code>${esc(tex)}</code>`);
        }
        if (parts.length) sections.push({ text: parts.join('\n') });
        break;
      }
      case 'reel': {
        const lines = [];
        for (const it of s.items || []) {
          const reel = it?.reelItem || it;
          const url = reel?.videoUrl || reel?.video_url || '';
          if (url) media.push(url);
          lines.push(`• <b>${esc(reel?.title || 'Video')}</b>`);
        }
        if (lines.length) sections.push({ text: `🎬 <b>${lines.length} reel(s)</b>\n${lines.join('\n')}` });
        break;
      }
      default:
        if (s.content) sections.push({ text: mdToHtml(s.content) });
        break;
    }
  }

  if (sections.length) {
    await sendRich(bot, chatId, { sections, footer: 'NEXORA • rich card' });
  }

  const urls = [...new Set(media)].filter((u) => u && String(u).startsWith('http')).slice(0, 10);
  if (urls.length === 1) {
    await bot.sendPhoto(chatId, urls[0]).catch(() => {});
  } else if (urls.length > 1) {
    await bot.sendMediaGroup(chatId, urls.map((u) => ({ type: 'photo', media: u }))).catch(() => {});
  }

  if (!sections.length && !urls.length) return false;
  return true;
}

export default { hasRichPayload, renderRichToTelegram, hasRichProtoMessage, renderRichProtoToTelegram };
