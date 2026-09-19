import { Providers } from '../../lib/webClient.js';
import { copyResultCard } from '../../lib/interactiveKit.js';

export default {
  name: 'currency',
  category: 'web',
  description: 'Convert currency.',
  cooldown: 5000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    if (args.length < 3) {
      return await m.reply.info('Usage: `${p}currency <amount> <from> <to>`\nExample: `${p}currency 100 USD EUR`', 'CURRENCY CONVERTER');
    }
    
    const amount = parseFloat(args[0]);
    const base = args[1].toUpperCase();
    const target = args[2].toUpperCase();
    
    if (isNaN(amount)) return await m.reply.error('Invalid amount provided.');
    
    try {
      const data = await Providers.currency(base);
      if (!data.rates || !data.rates[target]) {
        throw new Error(`Target currency ${target} not found.`);
      }
      
      const rate = data.rates[target];
      const result = amount * rate;
      
      const text = `💱 *CURRENCY CONVERSION*\n\n` +
        `*Amount:* ${amount} ${base}\n` +
        `*Rate:* 1 ${base} = ${rate} ${target}\n` +
        `*Result:* *${result.toFixed(2)} ${target}*\n\n` +
        `_Last Updated: ${data.time_last_update_utc.split(' ')[0]}_`;

      await copyResultCard(sock, m.from, {
        text,
        footer: 'NEXORA • ExchangeRate',
        copyLabel: '📋 Copy Result',
        copyValue: result.toFixed(2)
      }, { quoted: m });
    } catch (err) {
      await m.reply.error(`Failed to convert currency: ${err.message}`);
    }
  }
};
