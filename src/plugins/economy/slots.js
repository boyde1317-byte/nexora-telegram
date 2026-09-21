/**
 * slots.js — 3-reel emoji slot machine.
 *
 * Bet coins, spin the reels. Payouts:
 *   7️⃣7️⃣7️⃣   → ×20 jackpot
 *   🍒🍒🍒   → ×8
 *   💎💎💎   → ×12
 *   🍋🍋🍋   → ×5
 *   🔔🔔🔔   → ×4
 *   any 2 match → ×1.5 (bet back + half)
 * Single cute card + interactive buttons. Everything under withUserLock
 * so concurrent spins can't double-spend.
 */
import { withReactionStatus } from '../../lib/cosmetics.js';
import { withUserLock } from '../../economy/leveling.js';
import { actionCard } from '../../lib/interactiveKit.js';

const REELS   = ['🍒', '🍋', '🔔', '💎', '7️⃣'];
const TRIPLE  = { '7️⃣': 20, '💎': 12, '🍒': 8, '🍋': 5, '🔔': 4 };
const MIN_BET = 10;
const MAX_BET = 5000;

function spin() {
  // weight: 7️⃣ rarest, 🍒 most common
  const bag = ['🍒', '🍒', '🍒', '🍋', '🍋', '🔔', '🔔', '💎', '7️⃣'];
  return [
    bag[Math.floor(Math.random() * bag.length)],
    bag[Math.floor(Math.random() * bag.length)],
    bag[Math.floor(Math.random() * bag.length)],
  ];
}

function payoutFor(reels, bet) {
  const [a, b, c] = reels;
  if (a === b && b === c) return { mult: TRIPLE[a], label: 'TRIPLE' };
  if (a === b || b === c || a === c) return { mult: 1.5, label: 'PAIR' };
  return { mult: 0, label: 'MISS' };
}

export default {
  name: 'slots',
  aliases: ['slot', 'spin', 'bet'],
  category: 'economy',
  description: 'Spin the slot machine! .slots <bet> — pairs pay ×1.5, triples ×4–20.',
  cooldown: 4000,
  execute: async ({ m, sock, db, prefix, args }) => {
    const p = prefix || '.';
    await withReactionStatus(m, async () => {
      await withUserLock(m.sender, async () => {
        const user = db.getUser(m.sender);

        let bet = Math.floor(Number(args?.[0]));
        if (args?.[0] === 'max' || args?.[0] === 'all') bet = Math.min(user.coins ?? 0, MAX_BET);
        if (!Number.isFinite(bet) || bet <= 0) {
          return await m.reply(
            `🎰 *SLOTS*\n\nUsage: \`${p}slots <amount>\`\nExample: \`${p}slots 50\` or \`${p}slots max\`\n\nPayouts: pair ×1.5 ・ triples ×4 up to ×20 (7️⃣ jackpot)`
          );
        }
        bet = Math.min(bet, MAX_BET);

        if (bet < MIN_BET) return await m.reply(`Minimum bet is *${MIN_BET}* coins.`);
        if ((user.coins ?? 0) < bet) {
          return await m.reply(`Not enough coins! You have *${(user.coins ?? 0).toLocaleString()}* — bet was *${bet.toLocaleString()}*.\nTry \`${p}work\` or \`${p}daily\` to earn some.`);
        }

        const reels = spin();
        const { mult, label } = payoutFor(reels, bet);
        const delta = Math.round(bet * mult) - bet; // net change
        const newCoins = (user.coins ?? 0) + delta;
        db.setUser(m.sender, { coins: newCoins });

        const rowStr = '```' + `[ ${reels.join(' ┃ ')} ]` + '```';
        const won = delta > 0;

        const lines = [
          '✧･ﾟ: *SLOTS* :･ﾟ✧',
          '',
          rowStr,
          won
            ? `${label === 'TRIPLE' ? '🌟 *JACKPOT-CLASS WIN*' : '✨ *Pair!*'}  ${label}`
            : `${label === 'MISS' ? '💨 *No match*' : ''}`,
          '',
          won
            ? `🪙 *+${delta.toLocaleString()}* coins (${label} ×${mult})`
            : `🪙 ~${bet.toLocaleString()} coins lost to the void`,
          `⚖️ Wallet: *${newCoins.toLocaleString()}* coins`,
          '',
          mult === 20 ? '🏆 *7️⃣ 7️⃣ 7️⃣ — THE JACKPOT. Legendary.*' : '_·˚ ✦ NEXORA ✦ ˚·_',
        ];

        try {
          return await actionCard(sock, m.from, {
            text: lines.join('\n'),
            footer: 'NEXORA • Slots',
          }, [
            { label: '🎰 Spin again', cmd: `${p}slots ${bet}` },
            { label: '⚖️ Balance',    cmd: `${p}balance` },
            { label: '💼 Work',       cmd: `${p}work` },
          ], { quoted: m });
        } catch (_) {
          return await m.reply(lines.join('\n'));
        }
      });
    });
  },
};
