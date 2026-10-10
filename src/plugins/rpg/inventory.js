/**
 * @file src/plugins/rpg/inventory.js
 * .inv / .inventory — show your RPG bag and action cooldowns.
 */

import { getInventory, cooldownInfo, RESOURCE_PRICES, RESOURCE_EMOJI } from '../../economy/rpg.js';

export default {
  name: 'inventory',
  aliases: ['inv', 'bag'],
  category: 'rpg',
  description: 'Shows your RPG resources, their sale value and action cooldowns. Usage: .inv',
  cooldown: 4000,
  execute: async ({ m, prefix }) => {
    const p = prefix || '.';
    const { entries, isEmpty } = getInventory(m.sender);
    const cd = cooldownInfo(m.sender);

    if (isEmpty) {
      return await m.reply.info(
        `🎒 *Your bag is empty*\n\nEarn resources with:\n🏹 \`${p}hunt\` · ⛏️ \`${p}mine\` · 🎣 \`${p}fish\`\n\nThen sell them with \`${p}sell <item>\` for coins.`,
        'NEXORA • Inventory');
    }

    let total = 0;
    const lines = entries.map(([k, v]) => {
      const value = v * (RESOURCE_PRICES[k] ?? 0);
      total += value;
      return `${RESOURCE_EMOJI[k] ?? '📦'} *${k}*: ${v.toLocaleString()} (worth ${value.toLocaleString()} 🪙)`;
    });

    await m.reply.info(
      `🎒 *Your bag*\n\n${lines.join('\n')}\n\n💰 *Bag value:* ${total.toLocaleString()} 🪙\n_Sell everything with \`${p}sell all\`_\n\n⏳ *Cooldowns:* 🏹 ${cd.hunt} · ⛏️ ${cd.mine} · 🎣 ${cd.fish}`,
      'NEXORA • Inventory');
  },
};
