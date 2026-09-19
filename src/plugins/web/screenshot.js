import { Providers } from '../../lib/webClient.js';

export default {
  name: 'screenshot',
  aliases: ['ssweb', 'webshot'],
  category: 'web',
  description: 'Takes a screenshot of any website.',
  cooldown: 8000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    let url = args[0];
    if (!url) return await m.reply.info('Usage: `${p}screenshot <url>`', 'WEBSITE SCREENSHOT');
    if (!url.startsWith('http')) url = 'https://' + url;
    
    await m.react('⏳');
    try {
      const buffer = await Providers.screenshot(url);
      
      await sock.sendMessage(m.from, {
        image: buffer,
        caption: `📸 *Screenshot*\n🔗 ${url}`
      }, { quoted: m });
    } catch (err) {
      await m.reply.error(`Failed to take screenshot: ${err.message}`);
    }
  }
};
