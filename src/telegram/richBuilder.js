/**
 * richBuilder.js — rich message building, right in the Telegram panel.
 *
 * Compose rich cards like the classic "script shop" panels (emoji header,
 * subtitle, description, price table, ✅ benefit list, dropdown menu rows,
 * contact block + action button) — preview them natively in Telegram, then
 * push them to a WhatsApp chat as a real rich card via the engine.
 *
 * Spec shape (the /rich JSON):
 *   {
 *     "emoji": "👑",  "title": "NEXORA OFFICIAL",  "subtitle": "OPEN PARTNER",
 *     "description": "…",
 *     "sections": [
 *       { "price":    { "emoji": "💰", "title": "PRICE", "headers": ["Paket","Harga"],
 *                       "rows": [["Partner","Rp 25.000"]] } },
 *       { "benefits": { "emoji": "🎉", "title": "BENEFIT UTAMA", "items": ["…","…"] } },
 *       { "menu":     { "emoji": "🎁", "title": "DAFTAR KEUNTUNGAN",
 *                       "items": [{ "label": "SCRIPT", "text": "…", "url": "https://…" }] } }
 *     ],
 *     "contact": { "emoji": "☎️", "title": "CONTACT ORDER",
 *                  "admin": "Resterty", "handle": "resterty" },
 *     "footer": "NEXORA • rich card"
 *   }
 *
 * All fields optional except title. Section types are also accepted in
 * shorthand: { "price": [[...],[...]] } or { "benefits": ["…"] }.
 */

import { sendRich, renderTable, esc, mdToHtml, clipHtml } from './rich.js';
import { TEMPLATES, normalizeSpec, specToWhatsAppContent, templateJson } from '../lib/richCardSpec.js';

// re-export for the panel (/rich command + callbacks)
export { TEMPLATES, normalizeSpec, specToWhatsAppContent, templateJson };

/** Pending interactive cards — chatId → { messageId, spec } (for dropdown taps). */
const liveCards = new Map();


/** Spec → Telegram card. Renders via sendRich with a dropdown keyboard. */
export async function renderSpecToTelegram(bot, chatId, spec, opts = {}) {
  const s = normalizeSpec(spec);
  const parts = [];
  const buttons = [];

  const headerBits = [s.emoji, s.title].filter(Boolean).join(' ');
  parts.push(`<b>${esc(headerBits)}</b>`);
  if (s.subtitle) parts.push(`<b>${esc(s.subtitle)}</b>`);
  if (s.description) parts.push(mdToHtml(s.description));

  for (const sec of s.sections) {
    if (sec.price) {
      const p = sec.price;
      parts.push(`<b>${esc([p.emoji, p.title].filter(Boolean).join(' '))}</b>`);
      if (p.rows.length || p.headers.length) {
        parts.push(renderTable({ headers: p.headers, rows: p.rows, align: p.align }));
      }
    } else if (sec.benefits) {
      const b = sec.benefits;
      parts.push(`<b>${esc([b.emoji, b.title].filter(Boolean).join(' '))}</b>`);
      for (const item of b.items) parts.push(`✅ ${mdToHtml(item)}`);
    } else if (sec.menu) {
      const mn = sec.menu;
      parts.push(`<b>${esc([mn.emoji, mn.title].filter(Boolean).join(' '))}</b>`);
      // Dropdown rows — each row a button (chevron like the classic cards)
      let rowIdx = 0;
      for (const it of mn.items) {
        if (it.url) {
          buttons.push([{ text: `${it.label} ▾`, url: it.url }]);
        } else if (it.text) {
          buttons.push([{ text: `${it.label} ▾`, callback: `rich:show:${rowIdx++}` }]);
        } else {
          buttons.push([{ text: it.label, callback: 'rich:noop' }]);
        }
      }
    }
  }

  if (s.contact) {
    const c = s.contact;
    parts.push(`<b>${esc([c.emoji, c.title].filter(Boolean).join(' '))}</b>`);
    if (c.admin) parts.push(`Admin: ${esc(c.admin)}${c.handle ? ` — @${esc(c.handle)}` : ''}`);
    if (c.handle) buttons.push([{ text: '📞 Contact Admin', url: `https://t.me/${c.handle}` }]);
  }

  if (opts.backButton) buttons.push([{ text: '« Back to card', callback: 'rich:back' }]);

  const msg = await sendRich(bot, chatId, {
    title: '', sections: parts.map((text) => ({ text })), footer: s.footer || undefined,
    buttons: buttons.length ? buttons : undefined,
  });

  if (!opts.noStore) {
    // remember the card for dropdown taps (show/back callbacks)
    liveCards.set(String(chatId), { messageId: msg?.message_id, spec: s });
  }
  return msg;
}

/** Dropdown tap → edit the card into the sub-view. */
export async function showMenuDetail(bot, chatId, idx) {
  const live = liveCards.get(String(chatId));
  const menuSec = live?.spec.sections.find((x) => x.menu);
  const withText = menuSec?.menu.items.filter((it) => !it.url && it.text) || [];
  const item = withText[Number(idx)];
  if (!item) return false;
  const heading = `${menuSec.menu.emoji || '🎁'} <b>${esc(item.label)}</b>`;
  await bot.editMessageText(clipHtml(`${heading}\n\n${mdToHtml(item.text)}`, 4096), {
    chat_id: chatId, message_id: live.messageId, parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [[{ text: '« Back to card', callback_data: 'rich:back' }]] },
  });
  return true;
}

/** Back tap → re-render the stored card in place. */
export async function showCardBack(bot, chatId) {
  const live = liveCards.get(String(chatId));
  if (!live?.messageId) return false;
  const s = live.spec;
  const parts = [];
  const buttons = [];
  const headerBits = [s.emoji, s.title].filter(Boolean).join(' ');
  parts.push(`<b>${esc(headerBits)}</b>`);
  if (s.subtitle) parts.push(`<b>${esc(s.subtitle)}</b>`);
  if (s.description) parts.push(mdToHtml(s.description));
  for (const sec of s.sections) {
    if (sec.price) {
      parts.push(`<b>${esc([sec.price.emoji, sec.price.title].filter(Boolean).join(' '))}</b>`);
      parts.push(renderTable({ headers: sec.price.headers, rows: sec.price.rows }));
    } else if (sec.benefits) {
      parts.push(`<b>${esc([sec.benefits.emoji, sec.benefits.title].filter(Boolean).join(' '))}</b>`);
      for (const item of sec.benefits.items) parts.push(`✅ ${mdToHtml(item)}`);
    } else if (sec.menu) {
      parts.push(`<b>${esc([sec.menu.emoji, sec.menu.title].filter(Boolean).join(' '))}</b>`);
      let rowIdx = 0;
      for (const it of sec.menu.items) {
        if (it.url) buttons.push([{ text: `${it.label} ▾`, url: it.url }]);
        else if (it.text) buttons.push([{ text: `${it.label} ▾`, callback: `rich:show:${rowIdx++}` }]);
        else buttons.push([{ text: it.label, callback: 'rich:noop' }]);
      }
    }
  }
  if (s.contact) {
    parts.push(`<b>${esc([s.contact.emoji, s.contact.title].filter(Boolean).join(' '))}</b>`);
    if (s.contact.admin) parts.push(`Admin: ${esc(s.contact.admin)}${s.contact.handle ? ` — @${esc(s.contact.handle)}` : ''}`);
    if (s.contact.handle) buttons.push([{ text: '📞 Contact Admin', url: `https://t.me/${s.contact.handle}` }]);
  }
  const html = clipHtml(parts.join('\n'), 4096);
  await bot.editMessageText(html, {
    chat_id: chatId, message_id: live.messageId, parse_mode: 'HTML',
    ...(buttons.length ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });
  return true;
}


