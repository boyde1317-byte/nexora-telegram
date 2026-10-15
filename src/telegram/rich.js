/**
 * rich.js — Telegram-native rich message engine for NEXORA.
 *
 * Maps the WhatsApp rich-output style (banner + text + buttons) onto
 * Telegram's native primitives instead of dumping separate messages:
 *
 *   • photo cards    → sendPhoto with caption + inline keyboard (one message)
 *   • HTML styling   → <b> <i> <code> <pre> <blockquote> (parse_mode: HTML)
 *   • tables         → aligned monospace <pre> blocks
 *   • galleries      → sendMediaGroup albums (native stacked images)
 *   • long bodies    → chunked at 4096 chars, keyboard rides the last chunk
 *
 * v2 additions — the Telegram "message building" primitives:
 *   • buildRich()    — placeholder → in-place edit, the build-in-place effect
 *   • editRich()     — re-render an existing message into a rich card
 *   • { quote }      — expandable blockquote sections (collapsible <details>)
 *   • { spoiler }    — tap-to-reveal <tg-spoiler> text
 *   • preview        — kill link previews, or force one as a banner image
 *
 * Usage:
 *   import { sendRich, buildRich, editRich, mdToHtml, renderTable, buildKeyboard } from './rich.js';
 *   await sendRich(bot, chatId, {
 *     image: BANNER_PATH,                 // optional — upgrades to photo card
 *     title: '⚡ Welcome',
 *     sections: [
 *       { heading: 'Core commands', lines: ['/pair — link a number', ...] },
 *       { table: { headers: ['#', 'Session'], rows: [[1, '+233…']] } },
 *       { text: 'plain line with <b>html</b>' },
 *     ],
 *     footer: 'NEXORA v2',
 *     buttons: [[{ text: '⚡ Sessions', callback: 'nav:sessions' }]],
 *   });
 *
 * All existing panel strings use light Markdown (*bold*, _ital_, `code`) —
 * mdToHtml() converts them so migrations are drop-in.
 */

export const CAPTION_LIMIT = 1024;
export const TEXT_LIMIT = 4096;

/** Escape text for Telegram HTML parse mode. */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Convert the panel's light Markdown to Telegram HTML.
 * Supports *bold*, _italic_, `code`, and ```pre``` blocks. Escapes
 * everything else, so arbitrary user text is always safe.
 */
export function mdToHtml(text) {
  const src = String(text ?? '');
  // pull out fenced blocks first so their content stays literal
  const fences = [];
  let work = src.replace(/```([\s\S]*?)```/g, (_, body) => {
    fences.push(`<pre>${esc(body.replace(/^\n|\n$/g, ''))}</pre>`);
    return `%%FENCE${fences.length - 1}%%`;
  });
  work = esc(work)
    .replace(/\*([^*\n]+)\*/g, '<b>$1</b>')
    .replace(/(^|[^A-Za-z0-9_])_([^_\n]+)_(?![A-Za-z0-9_])/g, '$1<i>$2</i>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>');
  work = work.replace(/%%FENCE(\d+)%%/g, (_, i) => fences[Number(i)]);
  return work;
}

/**
 * Aligned monospace table → <pre> block. Telegram has no native table
 * element, so a padded ASCII grid in a code block is the crisp native look.
 * { headers: ['#', 'Number'], rows: [['1', '+233…'], ...], align?: ['l','r'] }
 */
export function renderTable({ headers = [], rows = [], align = [] }) {
  const matrix = [headers, ...rows].map((r) => r.map((c) => String(c ?? '')));
  const nCols = Math.max(...matrix.map((r) => r.length), 0);
  if (!nCols) return '';
  const widths = Array.from({ length: nCols }, (_, c) =>
    Math.min(26, Math.max(3, ...matrix.map((r) => (r[c] ?? '').length))));
  const cell = (val, c) => {
    const sv = String(val ?? '').slice(0, widths[c]);
    return ` ${align[c] === 'r' ? sv.padStart(widths[c]) : sv.padEnd(widths[c])} `;
  };
  const norm = (r) => Array.from({ length: nCols }, (_, c) => r[c]);
  const line = (r) => '│' + norm(r).map((v, c) => cell(v, c)).join('│') + '│';
  const bar = (l, m, t) => l + widths.map((w) => '─'.repeat(w + 2)).join(m) + t;
  const out = [
    bar('┌', '┬', '┐'), line(headers), bar('├', '┼', '┤'),
    ...rows.map((r) => line(r)), bar('└', '┴', '┘'),
  ];
  return `<pre>${esc(out.join('\n'))}</pre>`;
}

/** Portable buttons → Telegram inline keyboard.
 *  buttons: [[{ text, url } | { text, callback } | { text, data }]] */
export function buildKeyboard(buttons) {
  if (!buttons?.length) return undefined;
  const inline_keyboard = buttons.map((row) =>
    (Array.isArray(row) ? row : [row]).map((b) => {
      if (b.url) return { text: b.text, url: b.url };
      const data = b.callback || b.data;
      if (data) return { text: b.text, callback_data: String(data).slice(0, 64) };
      return { text: b.text, callback_data: 'noop' };
    }));
  return { inline_keyboard };
}

/** Render a rich content spec into one HTML string. */
export function renderContent({ title, sections = [], footer }) {
  const parts = [];
  if (title) parts.push(`<b>${esc(title)}</b>`);
  for (const s of sections) {
    if (s.heading) parts.push(`\n<b>${esc(s.heading)}</b>`);
    if (s.text) parts.push(s.text); // pre-authored HTML
    if (s.markdown) parts.push(mdToHtml(s.markdown));
    if (s.lines) parts.push(esc(s.lines.join('\n')).replace(/\n/g, '\n'));
    if (s.table) parts.push(renderTable(s.table));
    // Collapsible section — Telegram's native <details> element.
    // { quote: 'text' } or { quote: { text, expandable } }
    if (s.quote) {
      const q = typeof s.quote === 'string' ? { text: s.quote } : s.quote;
      parts.push(`<blockquote${q.expandable === false ? '' : ' expandable'}>${mdToHtml(q.text || '')}</blockquote>`);
    }
    // Tap-to-reveal: { spoiler: 'hidden text' }
    if (s.spoiler) parts.push(`<tg-spoiler>${esc(s.spoiler)}</tg-spoiler>`);
  }
  if (footer) parts.push(`\n<i>${esc(footer)}</i>`);
  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Hard-clip an HTML string at a byte-ish limit without breaking tags mid-way
 *  (falls back to a plain-text cut when a tag would dangle). */
export function clipHtml(html, limit) {
  if (html.length <= limit) return html;
  const cut = html.slice(0, limit - 1);
  const open = (cut.match(/<(b|i|u|s|code|pre|blockquote|a|tg-spoiler)[ >]/g) || []).length;
  const close = (cut.match(/<\/(b|i|u|s|code|pre|blockquote|a|tg-spoiler)>/g) || []).length;
  if (open === close) return cut + '…';
  return esc(html.replace(/<[^>]+>/g, '').slice(0, limit - 1)) + '…';
}

/**
 * Send a rich card. One message whenever possible:
 *   image + body ≤ 1024  → photo card with caption and keyboard attached
 *   body ≤ 4096          → HTML text message with keyboard attached
 *   longer               → chunked text messages, keyboard on the last
 */
export async function sendRich(bot, chatId, content = {}) {
  const { image, buttons, keyboard, preview, ...rest } = content;
  const html = renderContent(rest);
  const markup = keyboard || buildKeyboard(buttons);
  // preview: false kills link previews; a URL forces one (Telegram shows
  // it ABOVE the text — a free banner-image effect for cards).
  const linkPreview = preview === undefined ? undefined
    : preview === false ? { is_disabled: true }
    : { url: String(preview), is_disabled: false };

  if (image) {
    const caption = clipHtml(html, CAPTION_LIMIT);
    try {
      return await bot.sendPhoto(chatId, image, {
        caption,
        parse_mode: 'HTML',
        ...(markup ? { reply_markup: markup } : {}),
      });
    } catch (err) {
      // absent asset or Telegram hiccup — degrade to a text card, never fail
      console.warn('[TG][rich] photo card fell back to text:', err.message);
    }
  }

  if (html.length <= TEXT_LIMIT) {
    return bot.sendMessage(chatId, html, {
      parse_mode: 'HTML',
      ...(linkPreview ? { link_preview_options: linkPreview } : {}),
      ...(markup ? { reply_markup: markup } : {}),
    });
  }

  // chunk long bodies at newline boundaries
  const chunks = [];
  let restHtml = html;
  while (restHtml.length > TEXT_LIMIT) {
    let cut = restHtml.lastIndexOf('\n', TEXT_LIMIT);
    if (cut < TEXT_LIMIT * 0.5) cut = TEXT_LIMIT;
    chunks.push(restHtml.slice(0, cut));
    restHtml = restHtml.slice(cut).replace(/^\n+/, '');
  }
  chunks.push(restHtml);
  for (let i = 0; i < chunks.length; i++) {
    const last = i === chunks.length - 1;
    await bot.sendMessage(chatId, chunks[i], {
      parse_mode: 'HTML',
      ...((i === 0 && linkPreview) ? { link_preview_options: linkPreview } : {}),
      ...((last && markup) ? { reply_markup: markup } : {}),
    });
  }
  return chunks.length;
}


/**
 * Edit an existing message into a rich card — the second half of the
 * build-in-place pattern (sendRich placeholder → editRich final).
 */
export async function editRich(bot, chatId, messageId, content = {}) {
  const { buttons, keyboard, preview, ...rest } = content;
  const html = clipHtml(renderContent(rest), TEXT_LIMIT);
  const markup = keyboard || buildKeyboard(buttons);
  const linkPreview = preview === undefined ? undefined
    : preview === false ? { is_disabled: true }
    : { url: String(preview), is_disabled: false };
  return bot.editMessageText(html, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'HTML',
    ...(linkPreview ? { link_preview_options: linkPreview } : {}),
    ...(markup ? { reply_markup: markup } : {}),
  });
}

/**
 * BUILD-IN-PLACE: the classic Telegram "message building" effect.
 * Sends a placeholder ("⏳ Working…"), then swaps it into the final
 * rich card in one edit — the user watches the card materialize in
 * the same bubble. Falls back to a fresh card if the edit fails
 * (message too old, etc.). Returns the final message object.
 *
 *   await buildRich(bot, chatId, {
 *     progress: '⏳ Rolling the dice…',
 *     title: '🎲 Dice roll',
 *     sections: [{ text: 'You rolled a <b>6</b>!' }],
 *     buttons: [[{ text: '🎲 Again', callback: 'dice:again' }]],
 *   });
 */
export async function buildRich(bot, chatId, content = {}) {
  const { progress, ...rest } = content;
  let placeholder;
  try {
    placeholder = await bot.sendMessage(chatId, esc(progress || '⏳ Working…'));
  } catch (_) {
    return sendRich(bot, chatId, rest);
  }
  try {
    return await editRich(bot, chatId, placeholder.message_id, rest);
  } catch (err) {
    console.warn('[TG][rich] in-place edit failed, sending fresh card:', err.message);
    return sendRich(bot, chatId, rest);
  }
}

/**
 * Gallery — native Telegram album (2–10 images) with a shared caption
 * and keyboard. images: [{ path|url, caption? }] — first item's caption
 * (or the shared one) is used; Telegram shows it under the group.
 */
export async function sendGallery(bot, chatId, { images, caption, buttons }) {
  const media = images.slice(0, 10).map((img, i) => ({
    type: 'photo',
    media: img.path || img.url,
    ...(i === 0 && caption ? { caption: clipHtml(mdToHtml(caption), CAPTION_LIMIT), parse_mode: 'HTML' } : {}),
  }));
  if (media.length < 2) {
    return sendRich(bot, chatId, { image: media[0]?.media, title: caption, buttons });
  }
  const out = await bot.sendMediaGroup(chatId, media);
  if (buttons) {
    await bot.sendMessage(chatId, '🖼 Gallery above', {
      reply_markup: buildKeyboard(buttons),
    });
  }
  return out;
}
