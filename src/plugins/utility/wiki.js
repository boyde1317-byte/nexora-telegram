import { withReactionStatus } from '../../lib/cosmetics.js';
import { richTableCard, actionCardWithAd } from '../../lib/interactiveKit.js';
import { getBrandThumbnail } from '../../lib/cosmetics.js';
import { wikiSearch } from '../../lib/downloader.js';

export default {
  name: 'wiki',
  aliases: ['wikipedia'],
  category: 'utility',
  description: 'Look up a Wikipedia summary. Usage: .wiki <topic>',
  cooldown: 5000,
  execute: async ({ m, sock, args, prefix }) => {
    const query = args.join(' ').trim();
    if (!query) {
      return await m.reply.info(
        `Usage: \`${prefix}wiki <topic>\`\n\nExample: \`${prefix}wiki black holes\``,
        'WIKIPEDIA'
      );
    }

    await withReactionStatus(m, async () => {
      const result = await wikiSearch(query);
      const thumbnailUrl = await getBrandThumbnail();
      await richTableCard(sock, m.from, {
        title: `📖 ${result.title}`,
        rows: [['Summary', result.snippet]],
        footer: 'Source: Wikipedia',
      }, { quoted: m });

      await actionCardWithAd(sock, m.from, {
        text:   `📖 *${result.title}*

_Tap the thumbnail to read the full Wikipedia article._`,
        footer: 'NEXORA • Wikipedia',
      }, [
        { label: '🔍 Search Another', cmd: `${prefix}wiki` },
        { label: '🤖 Ask AI More',     cmd: `${prefix}ai Tell me more about ${result.title}` },
        { label: '🌐 Translate',       cmd: `${prefix}translate` },
      ], {
        title:    `📖 ${result.title}`,
        body:     'Wikipedia Article',
        sourceUrl: result.url,
        thumbnailUrl,
        originalImageUrl: thumbnailUrl,
        renderLargerThumbnail: true,
      }, { quoted: m });
    });
  }
};
