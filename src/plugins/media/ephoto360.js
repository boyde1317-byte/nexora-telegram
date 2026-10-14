/**
 * ephoto360.js — ephoto360 effect browser & renderer via api.jaky.dev.
 *
 * UX (all through the 22-category /v1/ephoto360 API):
 *   .ephoto                          → list categories
 *   .ephoto <category>               → list effects in that category (paged)
 *   .ephoto <category> <index> <text> → render that effect with your text
 *   .ephoto <category> <index> <text> (reply to a photo)
 *                                    → render with your photo filled in
 *
 * Renders cost API credits — a healthy cooldown keeps a group from
 * draining the key. Requires JAKY_API_KEY in .env.
 */
import { jaky } from '../../lib/jakyApi.js';

const CACHE = new Map(); // path -> { data, ts }
const CACHE_TTL = 10 * 60 * 1000; // category/effect lists are static — 10 min
const PAGE = 15;

async function cachedGet(path) {
  const hit = CACHE.get(path);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;
  const { ok, data } = await jaky.get(path);
  if (ok) CACHE.set(path, { data, ts: Date.now() });
  return ok ? data : null;
}

function findCategory(categories, needle) {
  const q = needle.toLowerCase().replace(/[\s_]+/g, '-');
  return categories.find((c) => c.slug === q)
    || categories.find((c) => c.slug.includes(q))
    || categories.find((c) => c.name.toLowerCase().replace(/[\s_]+/g, '-').includes(q))
    || null;
}

export default {
  name: 'ephoto360',
  aliases: ['ephoto'],
  category: 'media',
  description: 'Browse & render ephoto360 text/photo effects. Usage: .ephoto [category [index <text>]]',
  cooldown: 15000,

  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';

    if (!jaky.hasKey()) {
      return await m.reply.error('ephoto360 API key is not configured — set `JAKY_API_KEY` in .env.');
    }

    // ── level 1: no args → category list ─────────────────────────────────
    if (!args.length) {
      const list = await cachedGet('/v1/ephoto360');
      if (!list?.categories?.length) return await m.reply.error('Could not fetch the ephoto360 category list.');
      const lines = list.categories.map((c, i) => `${String(i + 1).padStart(2, ' ')}. ${c.name}`);
      return await m.reply.info(
        `*EPHOTO360 CATEGORIES*\n\n${lines.join('\n')}\n\n\`${p}ephoto <category>\` — list effects\n\`${p}ephoto <category> <index> <text>\` — render`,
        'EPHOTO360'
      );
    }

    // resolve the category from arg 0 (accepts slug, name, or list number)
    const list = await cachedGet('/v1/ephoto360');
    if (!list?.categories) return await m.reply.error('Could not fetch the ephoto360 category list.');
    const catArg = args[0];
    let cat = findCategory(list.categories, catArg);
    if (!cat && /^\d+$/.test(catArg)) {
      const idx = parseInt(catArg, 10) - 1;
      cat = list.categories[idx] || null;
    }
    if (!cat) return await m.reply.error(`Category not found. \`${p}ephoto\` shows all categories.`);

    // fetch the effect list for the category
    const styles = await cachedGet(`/v1/ephoto360/${cat.slug}`);
    if (!styles?.styles?.length) return await m.reply.error(`No effects found under *${cat.name}*.`);

    // ── level 2: category only → paged effect list ────────────────────────
    if (args.length === 1) {
      const page = Math.min(PAGE, styles.styles.length);
      const lines = styles.styles.slice(0, page).map((s, i) => `${String(i + 1).padStart(2, ' ')}. ${s.title}`);
      const more = styles.styles.length > page ? `\n… and ${styles.styles.length - page} more — render any by id: \`${p}ephoto ${cat.slug} id:<effect-id> <text>\`` : '';
      return await m.reply.info(
        `*${cat.name.toUpperCase()}* — ${styles.total} effects\n\n${lines.join('\n')}${more}\n\n\`${p}ephoto ${cat.slug} <index> <text>\` — render`,
        'EPHOTO360'
      );
    }

    // ── level 3: render ────────────────────────────────────────────────────
    // arg 1: index, `id:<n>`, or a bare effect id
    const ref = args[1];
    let style = null;
    if (/^id:?\d+$/.test(ref)) {
      const id = ref.replace(/^id:?/, '');
      style = styles.styles.find((s) => String(s.id) === id) || null;
    } else if (/^\d+$/.test(ref)) {
      style = styles.styles[parseInt(ref, 10) - 1] || null;
    } else {
      style = styles.styles.find((s) => s.id === ref || s.slug === ref) || null;
    }
    if (!style) return await m.reply.error(`Effect not found in *${cat.name}*. \`${p}ephoto ${cat.slug}\` lists valid indexes.`);

    const text = args.slice(2).join(' ').trim();
    if (!text) return await m.reply.error(`Usage: \`${p}ephoto ${cat.slug} <index> <text>\``);

    // optional photo fill — reply to a photo
    let imageUrl = null;
    try {
      const hasPhoto = m.hasMedia || (m.quoted?.message && Object.keys(m.quoted.message)[0]?.includes('Image'));
      if (hasPhoto) {
        const buffer = await (m.hasMedia ? m.download() : m.quoted.download());
        if (buffer) {
          const up = await jaky.uploadMedia(buffer, 'photo.jpg');
          if (up.ok) imageUrl = up.url;
        }
      }
    } catch (_) { /* photo fill is best-effort — text-only render still works */ }

    await m.react('⏳');
    const payload = { id: String(style.id), text };
    // schema accepts either spelling depending on effect type — send both
    if (imageUrl) {
      payload.imageUrl = imageUrl;
      payload.image_url = imageUrl;
    }
    const res = await jaky.post(`/v1/ephoto360/${cat.slug}`, payload, 240000);

    const url = res.data?.url || res.data?.result?.url || res.data?.data?.url;
    if (!res.ok || !url) {
      return await m.reply.error(res.data?.msg || 'The effect render failed.');
    }

    const buffer = await jaky.download(url);
    if (!buffer) return await m.reply.error('Render succeeded but the download failed — try again.');

    return await sock.sendMessage(m.from, {
      image: buffer,
      caption: `✨ *${style.title}*\n_${cat.name}_`,
    }, { quoted: m });
  },
};
