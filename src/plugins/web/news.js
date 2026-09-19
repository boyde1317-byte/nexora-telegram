/**
 * news.js — Latest news articles.
 *
 * Upgraded from copyResultCard → carousel (one card per article with source
 * URL button) with copyResultCard fallback for all article links.
 */
import { Providers } from '../../lib/webClient.js';
import { copyResultCard, actionCardWithAd } from '../../lib/interactiveKit.js';
import { getBrandThumbnail } from '../../lib/cosmetics.js';

export default {
  name: 'news',
  category: 'web',
  description: 'Get the latest news articles.',
  cooldown: 10000,
  execute: async ({ m, sock, args, prefix }) => {
    const p     = prefix || '.';
    const query = args.join(' ');

    try {
      const apiKey = process.env.NEWS_API_KEY;
      // No key? Use free Hacker News fallback (no key required)
      const result = await Providers.news(query, apiKey);
      if (!result.articles?.length) {
        return await m.reply.info('No news articles found for that topic.', 'NEWS');
      }

      const articles = result.articles.slice(0, 8);

      // NOTE: carouselMessage (baileysBridge.sendCarousel) is NOT used here —
      // relayMessage resolves successfully even when the recipient's WA
      // client can't render carouselMessage, so a try/catch around
      // sendCarousel never actually catches the failure (it shows up as
      // "your version of WhatsApp doesn't support it" on their screen).
      // copyResultCard (buttonsMessage-based) is the reliable path.
      let text = `📰 *${query ? `NEWS: ${query.toUpperCase()}` : 'TOP HEADLINES'}*\n\n`;
      articles.forEach((a, i) => {
        text += `*${i + 1}. ${a.title}*\n_${a.source?.name || 'Unknown'}_ — ${a.description || ''}\n🔗 ${a.url}\n\n`;
      });

      await copyResultCard(sock, m.from, {
        text:       text.trim(),
        footer:     'NEXORA • NewsAPI',
        copyLabel:  '📋 Copy All Links',
        copyValue:  articles.map(a => a.url).join('\n'),
      }, { quoted: m });
    } catch (err) {
      await m.reply.error(`Failed to fetch news: ${err.message}`);
    }
  }
};
