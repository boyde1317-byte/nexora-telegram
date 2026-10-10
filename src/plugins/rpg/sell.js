/**
 * @file src/plugins/rpg/sell.js
 * .sell — turn RPG resources into coins. Usage: .sell <item|all>
 */

import { sellResources, RESOURCE_PRICES, RESOURCE_EMOJI } from '../../economy/rpg.js';
import { db } from '../../database/db.js';

export default {
  name: 'sell',
  category: 'rpg',
  description: 'Sell RPG resources for coins. Usage: .sell <item> | .sell all',
  cooldown: 4000,
  execute: async ({ m, args, prefix }) => {
    const p = prefix || '.';
    const keys = args.map(a => a.toLowerCase()).filter(Boolean);
    if (keys.length === 0) {
      return await m.reply.info(
        `Usage: \`${p}sell <item|all>\`\n\n` +
        `Prices: ${Object.entries(RESOURCE_PRICES).map(([k, v]) => `${RESOURCE_EMOJI[k]} ${k} — ${v} 🪙`).join(' · ')}\n\n\`${p}sell all\` empties the whole bag.`,
        'NEXORA • Sell');
    }

    try {
      const { lines, coinsEarned } = await sellResources(m.sender, keys);
      const coins = db.getUser(m.sender).coins ?? 0;
      await m.reply.success(
        `💰 *Sold!*\n\n${lines.join('\n')}\n\n💵 *+${coinsEarned.toLocaleString()} coins*\n🪙 Balance: ${coins.toLocaleString()}`);
    } catch (err) {
      await m.reply.warn(err.message);
    }
  },
};
