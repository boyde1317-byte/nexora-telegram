import { mixedCard } from '../../lib/interactiveKit.js';

export default {
  name: 'choose',
  aliases: ['pick', 'decide'],
  category: 'fun',
  description: 'Choose between options. Usage: .choose option1, option2, ...',
  cooldown: 3000,
  execute: async ({ sock, m, args, prefix }) => {
    const input = args.join(' ');
    if (!input) {
      return await m.reply.info('Usage: .choose option1, option2, ...\nExample: .choose pizza, burger, pasta', 'CHOOSE');
    }
    const options = input.split(',').map(o => o.trim()).filter(Boolean);
    if (options.length < 2) {
      return await m.reply.error('Provide at least two options separated by commas.');
    }
    
    const chosen = options[Math.floor(Math.random() * options.length)];
    
    const commentary = options.length === 2
      ? `Coin flip energy, but more thoughtful. ☕`
      : options.length <= 4
      ? `Narrowed it down. You're welcome. ✦`
      : `So many choices. I've made the call. ⚡`;

    await mixedCard(sock, m.from, {
      text: `✦ *DECISION* ✦\n\nOptions: ${options.join(', ')}\n\nI choose: *${chosen}*\n${commentary}`,
      footer: 'NEXORA • Chooser'
    }, [
      { kind: 'action', label: '🔄 Decide Again', cmd: `${prefix}choose ${input}` }
    ], { quoted: m });
  }
};
