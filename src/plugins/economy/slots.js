/**
 * @file src/plugins/economy/slots.js
 * .slots [bet] — 3-reel slot machine. Weighted symbols, jackpot on 7️⃣7️⃣7️⃣,
 * streak-free one-button replay. House edge lives in the weight table.
 */

import { db } from '../../database/db.js';
import { withUserLock } from '../../economy/leveling.js';
import { commitAction } from '../../economy/actions.js';
import { withReactionStatus } from '../../lib/cosmetics.js';
import { richTableCard } from '../../lib/interactiveKit.js';

const MIN_BET = 10;
const MAX_BET = 50000;

// symbol → [weight, payout multiplier when TRIPLED, payout for a PAIR]
const SYMBOLS = {
  '🍒': { weight: 30, triple: 3,  pair: 1 },
  '🔔': { weight: 22, triple: 4,  pair: 1 },
  '🍀': { weight: 16, triple: 6,  pair: 2 },
  '💡': { weight: 12, triple: 8,  pair: 2 },
  '💎': { weight: 8,  triple: 12, pair: 3 },
  '7️⃣': { weight: 4,  triple: 25, pair: 4 },
};
const TOTAL_WEIGHT = Object.values(SYMBOLS).reduce((a, s) => a + s.weight, 0);

function spinReel() {
  let roll = Math.random() * TOTAL_WEIGHT;
  for (const [sym, s] of Object.entries(SYMBOLS)) {
    roll -= s.weight;
    if (roll <= 0) return sym;
  }
  return '🍒';
}

function evaluate(reels) {
  const [a, b, c] = reels;
  if (a === b && b === c) {
    return { multiplier: SYMBOLS[a].triple, kind: a === '7️⃣' ? 'JACKPOT' : 'TRIPLE' };
  }
  // best paying pair (any two matching)
  if (a === b || b === c || a === c) {
    const sym = (a === b || a === c) ? a : b;
    return { multiplier: SYMBOLS[sym].pair, kind: 'PAIR' };
  }
  return { multiplier: 0, kind: 'BUST' };
}

export default {
  name: 'slots',
  aliases: ['slot', 'reels'],
  category: 'economy',
  description: 'Spin the 3 reels. 7️⃣7️⃣7️⃣ pays x25! Pair pays too. Min bet 10.',
  cooldown: 4000,
  execute: async ({ m, sock, prefix }) => {
    const p = prefix || '.';
    await withReactionStatus(m, async () => {
      try {
        await withUserLock(m.sender, async () => {
          const u = db.getUser(m.sender);

          if (u.jailUntil && Date.now() < u.jailUntil) {
            return await m.reply.warn('🚔 You\'re still in jail. Cool your heels a bit.', 'SLOTS');
          }

          const bet = Math.floor(Number(m.args?.[0]));
          const amount = Number.isFinite(bet) && bet > 0 ? bet : 50;
          if (amount < MIN_BET) return await m.reply.warn(`Minimum bet is ${MIN_BET} coins.`, 'SLOTS');
          if (amount > MAX_BET) return await m.reply.warn(`Maximum bet is ${MAX_BET.toLocaleString()} coins.`, 'SLOTS');
          if ((u.coins ?? 0) < amount) {
            return await m.reply.warn(`Not enough coins. You have ${(u.coins ?? 0).toLocaleString()}.`, 'SLOTS');
          }

          const reels = [spinReel(), spinReel(), spinReel()];
          const { multiplier, kind } = evaluate(reels);
          const payout = Math.floor(amount * multiplier);
          const net = payout - amount;

          const stats = {
            slotsSpins: (u.stats?.slotsSpins ?? 0) + 1,
            slotsWins: (u.stats?.slotsWins ?? 0) + (net > 0 ? 1 : 0),
            biggestSlotsWin: Math.max(u.stats?.biggestSlotsWin ?? 0, net),
            slotsJackpot: (u.stats?.slotsJackpot ?? 0) + (kind === 'JACKPOT' ? 1 : 0),
          };

          const { result, lines } = commitAction(m.sender, {
            coinsDelta: net,
            xp: net > 0 ? Math.min(net, 50) : 0,
            stats,
            quest: 'slotWins',
            questN: net > 0 ? 1 : 0,
          });

          const reelStr = `  ${reels.join('  ┃  ')}  `;
          const title = kind === 'JACKPOT' ? '🎰 SLOTS — JACKPOT!!! 🎉'
            : net > 0 ? '🎰 SLOTS — WIN' : '🎰 SLOTS';
          const verdict =
            kind === 'JACKPOT' ? '7️⃣ TRIPLE SEVENS — x25 PAYOUT 🤑' :
            kind === 'TRIPLE' ? `${reels[0]}×3 — x${multiplier}!` :
            kind === 'PAIR' ? `Pair of ${reels.find(r => reels.filter(x => x === r).length === 2) || '…'} — x${multiplier}` :
            'No match. The house smiles.';

          const rows = [
            ['Reels', reelStr],
            ['Result', verdict],
            ['Bet', `🪙 ${amount.toLocaleString()}`],
            ['Payout', `${net >= 0 ? '+' : ''}${net.toLocaleString()} (now ${(result.after.coins ?? 0).toLocaleString()})`],
          ];
          if (result.leveledUp) rows.push(['Level up', `🎉 Level ${result.after.level}!`]);

          try {
            await richTableCard(sock, m.from, {
              title,
              headers: ['', ''],
              rows: rows.map(r => [r[0], r[1]]),
              footer: lines.length ? lines.join('\n') : `Spin again: ${p}slots ${amount}`,
              buttons: [
                { label: 'Spin again', cmd: `${p}slots ${amount}` },
                { label: 'Balance', cmd: `${p}balance` },
                { label: 'Quests', cmd: `${p}quests` },
              ],
            }, { quoted: m });
          } catch (_) {
            await m.reply(`${reelStr}\n\n${verdict}\n🪙 ${net >= 0 ? '+' : ''}${net.toLocaleString()} coins (now ${(result.after.coins ?? 0).toLocaleString()})${lines.length ? '\n' + lines.join('\n') : ''}`);
          }
        });
      } catch (e) {
        if (String(e?.message).includes('transaction')) return await m.reply.warn(String(e.message), 'SLOTS');
        await m.reply.error(`Slots error: ${e.message}`);
      }
    });
  },
};
