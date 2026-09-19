/**
 * meme.js — fresh memes as ONE stacked rich message.
 *
 * .meme              → 3 memes from r/memes
 * .meme 5            → up to 5 memes (1-5)
 * .meme dank         → category: dank | wholesome | meirl | programming
 * .meme 5 dank       → count + category combined
 *
 * Rich mode: every meme renders as a short description (the post
 * title) on top with its image inline right below — all stacked in a
 * single richResponse message. Falls back to plain image+caption
 * sends when rich responses are off or the relay fails.
 */
import capabilities from '../../core/capabilities.js';
import { baileysBridge } from '../../core/baileysBridge.js';

const SUBS = {
  meme:        'memes',
  dank:        'dankmemes',
  wholesome:   'wholesomememes',
  meirl:       'me_irl',
  me_irl:      'me_irl',
  programming: 'programmerhumor',
  tech:        'techhumor',
};

const fetchOpts = { headers: { 'User-Agent': 'NEXORA-MD' }, signal: AbortSignal.timeout(12000) };

async function fetchMemes(sub, count) {
  const res = await fetch(`https://meme-api.com/gimme/${sub}/${count}`, fetchOpts);
  if (!res.ok) throw new Error(`meme service returned HTTP ${res.status}`);
  const data = await res.json();
  const list = Array.isArray(data.memes) ? data.memes : [data.memes || data].flat().filter(Boolean);
  const seen = new Set();
  return list
    .filter(m => m?.url && !m.nsfw && !m.spoiler)
    .filter(m => { if (seen.has(m.url)) return false; seen.add(m.url); return true; })
    .map(m => ({
      title: (m.title || 'Untitled meme').slice(0, 90),
      // inlineImage is a STATIC primitive — GIF sources are swapped for
      // their largest png8 preview frame so they render instead of blanking.
      url: m.url,
      staticUrl: /\.gif($|\?)/i.test(m.url) ? (m.preview?.[m.preview.length - 1] || m.url) : m.url,
      link: m.postLink,
    }));
}

export default {
  name: 'meme',
  aliases: ['memes'],
  category: 'fun',
  description: 'Fresh memes stacked in one rich message: .meme [1-5] [dank|wholesome|meirl|programming]',
  cooldown: 15000,
  execute: async ({ sock, m, args }) => {
    const nums = args.filter(a => /^\d+$/.test(a)).map(Number);
    const subArg = args.find(a => SUBS[a?.toLowerCase()]);
    const count = Math.min(Math.max(nums[0] || 3, 1), 5);
    const sub = SUBS[subArg?.toLowerCase()] || 'memes';

    await m.react('🤣');
    let memes;
    try {
      memes = await fetchMemes(sub, count);
    } catch (err) {
      return await m.reply.error(`Meme service is unreachable (${err.message}). Try again in a moment.`);
    }
    if (!memes.length) return await m.reply.warn('No memes came back from that category — try again or pick another.');

    // ── Rich: one message, desc on top of each stacked inlineImage ────────
    if (capabilities.richResponse) {
      try {
        const payload = {
          richResponse: memes.flatMap(mn => [
            { text: `*${mn.title}*` },
            { inlineImage: mn.staticUrl, imageText: mn.title, tapLinkUrl: mn.link },
          ]),
        };
        return await baileysBridge.sendRichResponse(sock, m.from, payload, { quoted: m });
      } catch (err) {
        console.warn('[meme] rich stacked send failed, plain fallback:', err.message);
      }
    }

    // ── Plain fallback: image + caption per meme ──────────────────────────
    let sent = 0;
    for (const mn of memes) {
      try {
        await sock.sendMessage(m.from, { image: { url: mn.staticUrl }, caption: `*${mn.title}*` }, { quoted: m });
        sent++;
      } catch (_) { /* skip a broken one, keep going */ }
    }
    if (!sent) return await m.reply.error('Could not deliver any memes right now — the image hosts may be busy. Try again shortly.');
  },
};
