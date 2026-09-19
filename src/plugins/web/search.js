import { Providers } from '../../lib/webClient.js';
import { copyResultCard, actionCardWithAd } from '../../lib/interactiveKit.js';
import { getBrandThumbnail } from '../../lib/cosmetics.js';

export default {
  name: 'search',
  category: 'web',
  description: 'Search the web using DuckDuckGo.',
  cooldown: 5000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    const query = args.join(' ');
    if (!query) return await m.reply.info('Usage: `${p}search <query>`', 'WEB SEARCH');
    
    try {
      const result = await Providers.search(query);
      
      let text = `🔍 *SEARCH RESULTS: ${query}*\n\n`;
      if (result.AbstractText) {
        text += `${result.AbstractText}\n\n`;
      }
      
      if (result.RelatedTopics && result.RelatedTopics.length > 0) {
        const topics = result.RelatedTopics.slice(0, 5).filter(t => t.Text);
        if (topics.length > 0) {
          text += `*Related:*\n` + topics.map(t => `• ${t.Text}`).join('\n');
        }
      }
      
      if (!result.AbstractText && (!result.RelatedTopics || result.RelatedTopics.length === 0)) {
        text += `No direct abstract found for this query.`;
      }

      const thumbnailUrl = await getBrandThumbnail();
      const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
      await actionCardWithAd(sock, m.from, {
        text,
        footer: 'NEXORA • DuckDuckGo',
      }, [
        { label: '🔍 Search Again', cmd: `${prefix || '.'}search` },
        { label: '📖 Wiki Lookup',     cmd: `${prefix || '.'}wiki ${query}` },
        { label: '🤖 Ask AI',           cmd: `${prefix || '.'}ai ${query}` },
      ], {
        title:    `🔍 ${query.toUpperCase()}`,
        body:     'DuckDuckGo Search Results',
        sourceUrl: searchUrl,
        thumbnailUrl,
        originalImageUrl: thumbnailUrl,
        renderLargerThumbnail: false,
      }, { quoted: m });
    } catch (err) {
      await m.reply.error(`Failed to fetch search results: ${err.message}`);
    }
  }
};
