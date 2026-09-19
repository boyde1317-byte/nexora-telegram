import { Providers } from '../../lib/webClient.js';
import { copyResultCard } from '../../lib/interactiveKit.js';

export default {
  name: 'headers',
  category: 'web',
  description: 'Get HTTP headers for a URL.',
  cooldown: 5000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    let url = args[0];
    if (!url) return await m.reply.info('Usage: `${p}headers <url>`', 'HTTP HEADERS');
    if (!url.startsWith('http')) url = 'https://' + url;
    
    try {
      const headers = await Providers.headers(url);
      
      let text = `🔍 *HTTP HEADERS*\n🔗 ${url}\n\n`;
      for (const [key, value] of Object.entries(headers)) {
        text += `*${key}:*\n${value}\n\n`;
      }

      await copyResultCard(sock, m.from, {
        text: text.trim(),
        footer: 'NEXORA • HTTP Headers',
        copyLabel: '📋 Copy Headers',
        copyValue: JSON.stringify(headers, null, 2)
      }, { quoted: m });
    } catch (err) {
      await m.reply.error(`Failed to fetch headers: ${err.message}`);
    }
  }
};
