/**
 * rich.js — .rich — rich message building on WhatsApp.
 *
 * Compose "script shop"-style rich cards from a JSON spec: emoji header,
 * subtitle, description, price table, ✅ benefit list, dropdown menu rows,
 * contact block. The engine renders a real rich card (V1 submessage table +
 * items); degrades to a clean text card on failure.
 *
 *   .rich                      usage + template list
 *   .rich template menu        copy-ready JSON spec (menu|price|promo|contact)
 *   .rich <json>               render the card here
 *
 * Spec shape: see src/lib/richCardSpec.js
 */

import { TEMPLATES, normalizeSpec, specToWhatsAppContent, templateJson } from '../../lib/richCardSpec.js';
import { baileysBridge } from '../../core/baileysBridge.js';
import { messageFormatter } from '../../ui/messageFormatter.js';

export default {
  name: 'rich',
  aliases: ['richcard', 'richbuild'],
  category: 'utility',
  description: 'Build rich cards (price tables, benefits, menus) — .rich <json> or .rich template <name>',
  permissions: { owner: false },

  execute: async ({ m, sock, args }) => {
    const body = args.join(' ').trim();

    if (!body) {
      const names = Object.keys(TEMPLATES).join(' · ');
      return m.reply.info(
        `*🧱 Rich Message Building*\n\n` +
        `Compose rich cards: emoji header, price table, ✅ benefits, menu, contact.\n\n` +
        `*Usage*\n` +
        `• \`.rich template <name>\` — get a copy-ready JSON spec (${names})\n` +
        `• \`.rich <json>\` — render the card in this chat\n\n` +
        `_Tip: edit the template's title, prices and items, then paste the whole JSON._`
      );
    }

    // .rich template <name>
    if (body.toLowerCase().startsWith('template')) {
      const name = body.split(/\s+/)[1] || '';
      const json = templateJson(name);
      if (!json) return m.reply.warn(`Templates: ${Object.keys(TEMPLATES).map((t) => `\`.rich template ${t}\``).join(' · ')}`);
      return m.reply(`Copy, edit, then send \`.rich <json>\`:\n\n${json}`);
    }

    // .rich <json> → render
    let spec;
    try {
      const start = body.indexOf('{');
      if (start === -1) throw new Error('no JSON object found — paste the card spec after .rich');
      spec = JSON.parse(body.slice(start));
      normalizeSpec(spec); // friendly validation
    } catch (err) {
      return m.reply.error(`Invalid card spec: ${err.message || err}`);
    }

    try {
      const waContent = specToWhatsAppContent(spec);
      await baileysBridge.sendRichResponse(sock, m.from, waContent, { quoted: m });
      return;
    } catch (err) {
      console.warn('[rich] richResponse failed, text fallback:', err.message);
      // Clean text-card fallback so the feature never hard-fails
      const s = normalizeSpec(spec);
      const lines = [`${s.emoji} *${s.title}*`, s.subtitle ? `*${s.subtitle}*` : '', s.description]
        .filter(Boolean);
      for (const sec of s.sections) {
        if (sec.price) {
          lines.push('', `${sec.price.emoji} *${sec.price.title}*`,
            ...(sec.price.headers?.length ? [sec.price.headers.join(' │ ')] : []),
            ...sec.price.rows.map((r) => r.join(' │ ')));
        } else if (sec.benefits) {
          lines.push('', `${sec.benefits.emoji} *${sec.benefits.title}*`,
            ...sec.benefits.items.map((t) => `✅ ${t}`));
        } else if (sec.menu) {
          lines.push('', `${sec.menu.emoji} *${sec.menu.title}*`,
            ...sec.menu.items.map((it) => `▸ ${it.label}${it.text ? ` — ${it.text}` : ''}`));
        }
      }
      if (s.contact) {
        lines.push('', `${s.contact.emoji} *${s.contact.title}*`,
          `Admin: ${s.contact.admin}${s.contact.handle ? ` — wa.me/${s.contact.handle}` : ''}`);
      }
      if (s.footer) lines.push('', `_${s.footer}_`);
      return m.reply(messageFormatter.info ? messageFormatter.info(lines.join('\n')) : lines.join('\n'));
    }
  },
};
