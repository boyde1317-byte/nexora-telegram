import { Providers } from '../../lib/webClient.js';
import { copyResultCard } from '../../lib/interactiveKit.js';

export default {
  name: 'dns',
  category: 'web',
  description: 'Look up DNS records for a domain.',
  cooldown: 5000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    const domain = args[0];
    if (!domain) return await m.reply.info('Usage: `${p}dns <domain>`', 'DNS LOOKUP');
    
    try {
      const data = await Providers.dns(domain);
      if (!data.Answer || data.Answer.length === 0) {
        return await m.reply.info(`No DNS records found for ${domain}.`, 'DNS LOOKUP');
      }
      
      let text = `🌐 *DNS RECORDS: ${domain}*\n\n`;
      data.Answer.forEach(ans => {
        let type = 'UNKNOWN';
        if (ans.type === 1) type = 'A';
        else if (ans.type === 28) type = 'AAAA';
        else if (ans.type === 5) type = 'CNAME';
        else if (ans.type === 15) type = 'MX';
        else if (ans.type === 16) type = 'TXT';
        
        text += `*${type}*: ${ans.data} (TTL: ${ans.TTL})\n`;
      });

      await copyResultCard(sock, m.from, {
        text,
        footer: 'NEXORA • DNS Lookup',
        copyLabel: '📋 Copy Data',
        copyValue: text
      }, { quoted: m });
    } catch (err) {
      await m.reply.error(`DNS lookup failed: ${err.message}`);
    }
  }
};
