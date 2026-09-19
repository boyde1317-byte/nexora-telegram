import { Providers } from '../../lib/webClient.js';
import { copyResultCard } from '../../lib/interactiveKit.js';

export default {
  name: 'time',
  category: 'web',
  description: 'Get current time for a timezone.',
  cooldown: 5000,
  execute: async ({ m, sock, args }) => {
    const timezone = args[0] || 'UTC';
    
    try {
      const data = await Providers.time(timezone);
      if (data.error) throw new Error(data.error);
      
      const date = new Date(data.datetime);
      const formatted = date.toLocaleString('en-US', { timeZone: data.timezone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      const text = `🕒 *WORLD TIME: ${data.timezone}*\n\n` +
        `${formatted}\n\n` +
        `*Offset:* ${data.utc_offset}\n` +
        `*Abbreviation:* ${data.abbreviation}`;

      await copyResultCard(sock, m.from, {
        text,
        footer: 'NEXORA • World Clock',
        copyLabel: '📋 Copy Time',
        copyValue: formatted
      }, { quoted: m });
    } catch (err) {
      await m.reply.error(`Failed to fetch time for ${timezone}: ${err.message}`);
    }
  }
};
