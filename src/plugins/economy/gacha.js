/**
 * @file src/plugins/economy/gacha.js
 * .gacha — the pull machine. 300 coins a pull, five rarities, pity at 20.
 */

import { db } from '../../database/db.js';
import { gachaPull, PULL_COST, PITY_THRESHOLD, TIER_EMOJI } from '../../economy/gacha.js';
import { withReactionStatus } from '../../lib/cosmetics.js';
import { mixedCard } from '../../lib/interactiveKit.js';

export default {
  name: 'gacha',
  aliases: ['pull'],
  category: 'economy',
  description: `Pull the slot machine for coins, gems and XP. ${PULL_COST} coins per pull. Pity guarantees Rare+ every ${PITY_THRESHOLD} pulls.`,
  cooldown: 6000,
  execute: async ({ m, sock, prefix }) => {
    const p = prefix || '.';
    await withReactionStatus(m, async () => {
      try {
        const result = await gachaPull(m.sender);
        const { tier, reward } = result;
        const emoji = TIER_EMOJI[tier] || '🎰';

        let effectLine;
        if (reward.kind === 'coins') {
          const net = reward.amount - PULL_COST;
          effectLine = net >= 0
            ? `🪙 *+${reward.amount.toLocaleString()} coins* (net ${net >= 0 ? '+' : ''}${net.toLocaleString()} after the ${PULL_COST} cost)`
            : `🪙 ${reward.amount.toLocaleString()} coins back — ${net.toLocaleString()} net. The house nibbles.`;
        } else if (reward.kind === 'xp') {
          effectLine = `✨ *+${reward.amount.toLocaleString()} XP*`;
        } else {
          effectLine = `💎 *+${reward.amount} gem${reward.amount > 1 ? 's' : ''}* added to your bag (\`${p}inv\`)`;
        }

        const isBig = ['Epic', 'Legendary'].includes(tier);
        const text =
          `🎰 *GACHA PULL* 🎰\n\n${emoji} *${tier.toUpperCase()}* ${emoji}\n\n${reward.msg.replace('{n}', reward.amount.toLocaleString())}\n\n${effectLine}` +
          (result.usedPity
            ? `\n\n🌠 *Pity triggered!* The machine owed you.`
            : `\n\n_Pity: ${result.pityCounter}/${result.pityAt} pulls until a guaranteed Rare+ (Rare+ resets it)_`);

        const buttons = [
          { kind: 'action', label: `🎰 Pull Again (${PULL_COST} 🪙)`, cmd: `${p}gacha` },
          { kind: 'action', label: '💰 Balance', cmd: `${p}balance` },
        ];

        if (isBig) {
          // Big wins deserve the dramatic rich card.
          await mixedCard(sock, m.from, { text, footer: 'NEXORA • Gacha' }, buttons, { quoted: m });
        } else {
          await m.reply.info(text, 'NEXORA • Gacha');
        }
      } catch (err) {
        await m.reply.warn(err.message);
      }
    });
  },
};
