import { Providers } from '../../lib/webClient.js';
import { copyResultCard } from '../../lib/interactiveKit.js';

export default {
  name: 'whois',
  category: 'web',
  description: 'Lookup WHOIS information for a domain.',
  cooldown: 5000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    const domain = args[0];
    if (!domain) return await m.reply.info('Usage: `${p}whois <domain>`', 'WHOIS LOOKUP');
    
    try {
      const data = await Providers.whois(domain);
      if (!data.status || data.status !== 'OK') throw new Error('WHOIS lookup failed or domain not found.');
      
      const result = data.whois || {};
      
      const text = `🌍 *WHOIS: ${domain}*\n\n` +
        `*Registrar:* ${result.registrar || 'N/A'}\n` +
        `*Creation Date:* ${result.creation_date ? new Date(result.creation_date).toLocaleDateString() : 'N/A'}\n` +
        `*Expiration Date:* ${result.expiration_date ? new Date(result.expiration_date).toLocaleDateString() : 'N/A'}\n` +
        `*Updated Date:* ${result.updated_date ? new Date(result.updated_date).toLocaleDateString() : 'N/A'}\n` +
        `*Status:* ${(result.status || []).join(', ') || 'N/A'}`;

      await copyResultCard(sock, m.from, {
        text,
        footer: 'NEXORA • WHOIS',
        copyLabel: '📋 Copy Data',
        copyValue: text
      }, { quoted: m });
    } catch (err) {
      await m.reply.error(`WHOIS lookup failed: ${err.message}`);
    }
  }
};
