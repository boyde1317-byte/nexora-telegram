/**
 * quoter.js — fetch and display a random inspirational quote.
 *
 * Uses cta_copy so users can copy the quote in one tap,
 * plus a cta_url to look up the author and a quick_reply for another quote.
 */
import { withReactionStatus } from '../../lib/cosmetics.js';
import { getBrandThumbnail } from '../../lib/cosmetics.js';
import { copyResultCard, mixedCard } from '../../lib/interactiveKit.js';
import { sendAdReply } from '../../lib/waUtils.js';

export default {
  name: 'quoter',
  aliases: ['quote', 'inspire', 'wisdom', 'qotd'],
  category: 'fun',
  description: 'Fetches a random inspirational quote with one-tap copy and author lookup.',
  cooldown: 3000,
  execute: async ({ m, sock, args, prefix }) => {
    const p   = prefix || '.';
    const tag = args[0] ? encodeURIComponent(args[0].toLowerCase()) : '';

    await withReactionStatus(m, async () => {
      const url = tag
        ? `https://dummyjson.com/quotes/random?tags=${tag}`
        : 'https://dummyjson.com/quotes/random';

      const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error('Quote service unavailable, try again.');
      const data = await res.json();
      if (!data.quote) throw new Error('No quote returned.');

      const quoteText  = `"${data.content}"`;
      const authorName = data.author || 'Unknown';
      const tags       = (data.tags || []).join(' • ') || 'General';
      const authorUrl  = `https://en.wikipedia.org/wiki/${encodeURIComponent(authorName.replace(/ /g, '_'))}`;
      const tagArg     = data.tags?.[0] ? ` ${encodeURIComponent(data.tags[0])}` : '';

      const bodyText = `💬 *${quoteText}*\n\n— _${authorName}_\n\n🏷️ ${tags}`;

      // ── Tier 1: mixed card — copy, URL, and quick_reply buttons ───────────
      try {
        return await mixedCard(sock, m.from, {
          text:   bodyText,
          footer: `Quote of the Moment • ${authorName}`,
        }, [
          { kind: 'copy',   label: '📋 Copy Quote',     value: `${quoteText}\n— ${authorName}` },
          { kind: 'url',    label: `🔎 About ${authorName.split(' ')[0]}`, url: authorUrl },
          { kind: 'action', label: '🔁 Another Quote',  cmd:   `${p}quote${tagArg}` },
        ], { quoted: m });
      } catch (err) {
        console.warn('[quoter] Tier 1 failed:', err.message);
      }

      // ── Tier 2: adReply card (original fallback) ──────────────────────────
      const thumbnailUrl = await getBrandThumbnail();
      await sendAdReply(sock, m.from, bodyText, {
        title:     '✨ QUOTE OF THE MOMENT',
        body:      `— ${authorName}`,
        thumbnailUrl,
        originalImageUrl: thumbnailUrl,
      }, { quoted: m });
    });
  },
};
