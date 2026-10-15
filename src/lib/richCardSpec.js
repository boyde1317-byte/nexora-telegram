/**
 * richCardSpec.js — the rich-card spec engine, shared by both NEXORA repos.
 *
 * A declarative JSON spec for "script shop"-style rich cards (emoji header,
 * subtitle, description, price table, ✅ benefit list, dropdown menu rows,
 * contact block + action button):
 *
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
 * Consumers:
 *   • WhatsApp: .rich plugin → specToWhatsAppContent() → sendRichResponse
 *   • Telegram panel: /rich builder → renders the same spec natively
 *
 * All fields optional except title. Section types accept shorthand too:
 * { "price": [[...],[...]] } or { "benefits": ["…"] }.
 */

/** Built-in templates — copy, edit, render, send. */
export const TEMPLATES = {
  menu: {
    emoji: '👑', title: 'NEXORA OFFICIAL', subtitle: 'OPEN PARTNER',
    description: 'Jadi partner resmi — akses semua script, tools & layanan premium!',
    sections: [
      { price: { emoji: '💰', title: 'PRICE', headers: ['Paket', 'Harga'], rows: [['Partner', 'Rp 25.000']] } },
      { benefits: { emoji: '🎉', title: 'BENEFIT UTAMA', items: [
        'Benefit Anti Ampas / Rongsokan',
        'Benefit Full Update / Bertambah',
        'Akses semua script, tools & layanan partner',
        'Full dorongan & support',
      ] } },
      { menu: { emoji: '🎁', title: 'DAFTAR KEUNTUNGAN', items: [
        { label: 'SCRIPT', text: 'Semua script partner tersedia untuk kamu — update tiap minggu, bebas pakai selama status partner aktif.' },
        { label: 'TOOLS', text: 'Akses penuh ke tools panel: downloader, sticker maker, AI suite, dan semua fitur premium lainnya.' },
        { label: 'LAINNYA', text: 'Layanan tambahan: prioritas support, akses beta fitur, dan partner community.' },
      ] } },
    ],
    contact: { emoji: '☎️', title: 'CONTACT ORDER', admin: 'Resterty', handle: 'resterty' },
    footer: 'NEXORA • rich card',
  },
  price: {
    emoji: '💰', title: 'PRICE LIST', subtitle: 'NEXORA STORE',
    description: 'Daftar harga layanan — valid bulan ini.',
    sections: [
      { price: { emoji: '📋', title: 'LAYANAN', headers: ['Layanan', 'Harga'], rows: [
        ['Partner', 'Rp 25.000'], ['Script custom', 'Rp 50.000'], ['Setup bot', 'Rp 75.000'],
      ] } },
    ],
    contact: { emoji: '☎️', title: 'CONTACT ORDER', admin: 'Resterty', handle: 'resterty' },
    footer: 'Hubungi admin untuk order',
  },
  promo: {
    emoji: '🔥', title: 'PROMO SPESIAL', subtitle: 'LIMITED TIME',
    description: 'Diskon partner minggu ini — jangan sampai kehabisan!',
    sections: [
      { benefits: { emoji: '🎁', title: 'PROMO INCLUDES', items: [
        'Semua script premium terbuka',
        'Update full selama 1 bulan',
        'Prioritas support 24/7',
      ] } },
    ],
    contact: { emoji: '☎️', title: 'ORDER NOW', admin: 'Resterty', handle: 'resterty' },
    footer: 'Promo berakhir akhir bulan',
  },
  contact: {
    emoji: '☎️', title: 'CONTACT CARD', subtitle: 'ADMIN NEXORA',
    description: 'Butuh bantuan, order, atau partnership? Hubungi admin.',
    sections: [
      { benefits: { emoji: '✅', title: 'WHY US', items: [
        'Respon cepat', 'Garansi layanan', 'Update berkala',
      ] } },
    ],
    contact: { emoji: '☎️', title: 'CONTACT ORDER', admin: 'Resterty', handle: 'resterty' },
    footer: 'NEXORA • rich card',
  },
};

/** Normalize a user spec: shorthand forms → full objects. Throws Error with a
 *  friendly message on bad shape. */
export function normalizeSpec(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error('Spec must be a JSON object');
  if (!spec.title) throw new Error('Spec needs at least a "title"');
  const out = {
    emoji: spec.emoji || '', title: String(spec.title), subtitle: spec.subtitle || '',
    description: spec.description || '', sections: [], contact: spec.contact || null,
    footer: spec.footer || '',
  };
  // Accept sections under "sections" AND as top-level convenience keys
  let secList = Array.isArray(spec.sections) ? spec.sections : [];
  if (spec.price && !secList.some((x) => x.price)) secList = secList.concat([{ price: spec.price }]);
  if (spec.benefits && !secList.some((x) => x.benefits)) secList = secList.concat([{ benefits: spec.benefits }]);
  if (spec.menu && !secList.some((x) => x.menu)) secList = secList.concat([{ menu: spec.menu }]);
  for (const s of secList) {
    if (!s || typeof s !== 'object') continue;
    if (s.price) {
      const p = Array.isArray(s.price) ? { rows: s.price } : s.price;
      const rows = (p.rows || []).map((r) => (Array.isArray(r) ? r.map(String) : [String(r)]));
      out.sections.push({ price: {
        emoji: p.emoji || '💰', title: p.title || 'PRICE',
        headers: Array.isArray(p.headers) ? p.headers.map(String) : (rows[0] || []),
        rows: p.headers ? rows : rows.slice(1),
      } });
    } else if (s.benefits) {
      const b = Array.isArray(s.benefits) ? { items: s.benefits } : s.benefits;
      out.sections.push({ benefits: {
        emoji: b.emoji || '🎉', title: b.title || 'BENEFITS',
        items: (b.items || []).map(String),
      } });
    } else if (s.menu) {
      const mn = Array.isArray(s.menu) ? { items: s.menu } : s.menu;
      const items = (mn.items || []).map((it, i) => typeof it === 'string'
        ? { label: it, text: '', url: '' } : { label: it?.label || `Item ${i + 1}`, text: it?.text || '', url: it?.url || '' });
      out.sections.push({ menu: { emoji: mn.emoji || '🎁', title: mn.title || 'MENU', items } });
    }
  }
  if (out.contact && typeof out.contact === 'object') {
    out.contact = { emoji: out.contact.emoji || '☎️', title: out.contact.title || 'CONTACT ORDER',
      admin: String(out.contact.admin || ''), handle: String(out.contact.handle || '').replace(/^@/, '') };
  } else out.contact = null;
  return out;
}

/** Spec → declarative WhatsApp rich payload (engine renders the real card). */
export function specToWhatsAppContent(spec) {
  const s = normalizeSpec(spec);
  const rich = [];
  const content = [];
  if (s.description) content.push(s.description);
  for (const sec of s.sections) {
    if (sec.price) {
      rich.push({
        title: `${sec.price.emoji} ${sec.price.title}`.trim(),
        table: [
          ...(sec.price.headers.length ? [{ items: sec.price.headers, isHeading: true }] : []),
          ...sec.price.rows.map((r) => ({ items: r })),
        ],
      });
    } else if (sec.benefits) {
      rich.push({
        title: `${sec.benefits.emoji} ${sec.benefits.title}`.trim(),
        items: sec.benefits.items.map((t) => ({ title: '✅', text: t })),
      });
    } else if (sec.menu) {
      rich.push({
        title: `${sec.menu.emoji} ${sec.menu.title}`.trim(),
        items: sec.menu.items.map((it) => ({ title: it.label, text: it.text })),
      });
    }
  }
  if (s.contact) {
    const c = s.contact;
    const line = `${c.emoji} *${c.title}*`;
    const admin = `Admin: ${c.admin}${c.handle ? ` — wa.me/${c.handle}` : ''}`;
    rich.push({ text: `${line}\n${admin}` });
  }
  return {
    headerText: `${s.emoji} ${s.title}${s.subtitle ? ` — ${s.subtitle}` : ''}`.trim(),
    contentText: content.join('\n\n'),
    footerText: s.footer || '',
    richResponse: rich,
  };
}

/** Template JSON for `.rich template <name>` / `/rich template <name>` —
 *  pretty-printed, copy-ready. Returns null for unknown names. */
export function templateJson(name, fence = 'json') {
  const key = String(name || '').toLowerCase().replace(/^\.+/, '');
  const t = TEMPLATES[key];
  if (!t) return null;
  return '```' + fence + '\n' + JSON.stringify(t, null, 2) + '\n```';
}
