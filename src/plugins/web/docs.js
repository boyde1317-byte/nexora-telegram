import { Providers } from '../../lib/webClient.js';
import { copyResultCard } from '../../lib/interactiveKit.js';

export default {
  name: 'docs',
  aliases: ['mdn'],
  category: 'web',
  description: 'Search MDN Web Docs.',
  cooldown: 5000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    const query = args.join(' ');
    if (!query) return await m.reply.info('Usage: `${p}docs <query>`\nExample: `${p}docs Array.map`', 'MDN DOCS');
    
    try {
      const data = await Providers.docs(query);
      if (!data.documents || data.documents.length === 0) {
        return await m.reply.info('No documentation found.', 'MDN DOCS');
      }
      
      const top = data.documents[0];
      const text = `📘 *MDN: ${top.title}*\n\n` +
        `${top.summary}\n\n` +
        `🔗 https://developer.mozilla.org${top.mdn_url}`;

      await copyResultCard(sock, m.from, {
        text,
        footer: 'NEXORA • MDN Docs',
        copyLabel: '📋 Copy Link',
        copyValue: `https://developer.mozilla.org${top.mdn_url}`
      }, { quoted: m });
    } catch (err) {
      await m.reply.error(`Search failed: ${err.message}`);
    }
  }
};
