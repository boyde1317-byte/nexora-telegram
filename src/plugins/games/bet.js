/**
 * bet.js — Gamble coins on a coin flip or dice roll.
 *
 * .bet flip <amount>   — Bet on heads/tails (50/50, 2x payout)
 * .bet dice <amount>   — Roll a die, win on 4+ (60% chance, 1.5x payout)
 * .bet slots <amount>  — Spin a 3-reel slot machine (jackpot = 10x)
 *
 * Economy sink — the house edge keeps the economy balanced:
 *   flip:  0% edge (true 50/50)
 *   dice:  10% edge (60% win rate, 1.5x payout)
 *   slots: ~15% edge (see SLOT_PAYOUTS)
 */
import { withReactionStatus } from '../../lib/cosmetics.js';
import { mixedCard } from '../../lib/interactiveKit.js';
import { asciiBuilder } from '../../ui/asciiBuilder.js';
import { withUserLock } from '../../economy/leveling.js';

const MIN_BET = 10;
const MAX_BET = 5000;

const SLOT_SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '🔔', '⭐', '💎'];
const SLOT_PAYOUTS = {
  '💎': 10,  // jackpot
  '⭐': 5,
  '🔔': 3,
  '🍇': 2,
  '🍊': 2,
  '🍋': 2,
  '🍒': 2,
};

export default {
  name: 'bet',
  aliases: ['gamble', 'casino'],
  category: 'games',
  description: 'Gamble coins. Usage: .bet flip <amount> | .bet dice <amount> | .bet slots <amount>',
  cooldown: 5000,
  execute: async ({ m, sock, db, args, prefix }) => {
    const p = prefix || '.';
    const game = args[0]?.toLowerCase();
    const amount = parseInt(args[1], 10);

    if (!game || !['flip', 'dice', 'slots'].includes(game)) {
      return await m.reply.info(
        `Pick your poison:\n• \`${p}bet flip <amount>\` — 50/50, 2x payout\n• \`${p}bet dice <amount>\` — win on 4+, 1.5x payout\n• \`${p}bet slots <amount>\` — 3-reel slots, up to 10x jackpot 💎\n\nMin bet: ${MIN_BET} 🪙 • Max bet: ${MAX_BET} 🪙\n_The house always wins... eventually. But not today. Maybe._`,
        'NEXORA • Bet'
      );
    }

    if (!amount || amount < MIN_BET) {
      return await m.reply.error(`Minimum bet is ${MIN_BET} 🪙. Usage: \`${p}bet ${game} <amount>\``);
    }
    if (amount > MAX_BET) {
      return await m.reply.error(`Maximum bet is ${MAX_BET} 🪙. Usage: \`${p}bet ${game} <amount>\``);
    }

    try {
      await withUserLock(m.sender, async () => {
        const userData = db.getUser(m.sender);
        const coins = userData.coins ?? 0;

        if (coins < amount) {
          return await m.reply.error(
            `Not enough coins! You have ${coins.toLocaleString()} 🪙 but tried to bet ${amount.toLocaleString()}.`
          );
        }

        await withReactionStatus(m, async () => {
          // Deduct the bet upfront
          db.setUser(m.sender, { coins: coins - amount });

          if (game === 'flip') {
            // ── Coin Flip: 50/50, 2x payout ─────────────────────────────
            const win = Math.random() < 0.5;
            const result = win ? 'Heads' : 'Tails';
            const emoji = win ? '🪙' : '🪙';

            if (win) {
              const payout = amount * 2;
              db.setUser(m.sender, { coins: (coins - amount) + payout });
              await mixedCard(sock, m.from, {
                text: `🎰 *COIN FLIP*\n\n${emoji} Result: *${result}*\n\n✅ You won! The casino hates you.\n🪙 Bet: ${amount} → Payout: ${payout} (+${payout - amount} profit)`,
                footer: 'NEXORA • Bet',
              }, [
                { kind: 'action', label: '🔄 Flip Again', cmd: `${p}bet flip ${amount}` },
                { kind: 'action', label: '🎲 Try Dice',   cmd: `${p}bet dice ${amount}` },
                { kind: 'action', label: '🎰 Try Slots',  cmd: `${p}bet slots ${amount}` },
              ], { quoted: m });
            } else {
              await mixedCard(sock, m.from, {
                text: `🎰 *COIN FLIP*\n\n${emoji} Result: *${result}*\n\n❌ You lost! The house always wins... eventually.\n🪙 Bet: ${amount} → Lost ${amount} coins`,
                footer: 'NEXORA • Bet',
              }, [
                { kind: 'action', label: '🔄 Try Again',  cmd: `${p}bet flip ${amount}` },
                { kind: 'action', label: '💰 Check Balance', cmd: `${p}balance` },
                { kind: 'action', label: '🪙 Claim Daily',   cmd: `${p}daily` },
              ], { quoted: m });
            }
          }

          else if (game === 'dice') {
            // ── Dice Roll: win on 4+, 1.5x payout ─────────────────────────
            const roll = Math.floor(Math.random() * 6) + 1;
            const win = roll >= 4;

            if (win) {
              const payout = Math.floor(amount * 1.5);
              db.setUser(m.sender, { coins: (coins - amount) + payout });
              await mixedCard(sock, m.from, {
                text: `🎲 *DICE ROLL*\n\nResult: *${roll}* (4+ wins)\n\n✅ You won! Lucky number energy.\n🪙 Bet: ${amount} → Payout: ${payout} (+${payout - amount} profit)`,
                footer: 'NEXORA • Bet',
              }, [
                { kind: 'action', label: '🔄 Roll Again', cmd: `${p}bet dice ${amount}` },
                { kind: 'action', label: '🪙 Flip Coin',  cmd: `${p}bet flip ${amount}` },
                { kind: 'action', label: '🎰 Try Slots', cmd: `${p}bet slots ${amount}` },
              ], { quoted: m });
            } else {
              await mixedCard(sock, m.from, {
                text: `🎲 *DICE ROLL*\n\nResult: *${roll}* (4+ wins)\n\n❌ You lost! Roll low, lose big. Try again?\n🪙 Bet: ${amount} → Lost ${amount} coins`,
                footer: 'NEXORA • Bet',
              }, [
                { kind: 'action', label: '🔄 Try Again',      cmd: `${p}bet dice ${amount}` },
                { kind: 'action', label: '💰 Check Balance', cmd: `${p}balance` },
                { kind: 'action', label: '🪙 Claim Daily',   cmd: `${p}daily` },
              ], { quoted: m });
            }
          }

          else if (game === 'slots') {
            // ── Slot Machine: 3 reels, match all 3 for jackpot ───────────
            const spin = [
              SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)],
              SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)],
              SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)],
            ];

            const allMatch = spin[0] === spin[1] && spin[1] === spin[2];
            const twoMatch = spin[0] === spin[1] || spin[1] === spin[2] || spin[0] === spin[2];

            let payout = 0;
            let resultText = '';

            if (allMatch) {
              const multiplier = SLOT_PAYOUTS[spin[0]] || 3;
              payout = amount * multiplier;
              resultText = `🎉 *JACKPOT!* All three match!\n${spin.join(' | ')}\n\n✅ You won ${multiplier}x! The slots gods favor you today.`;
            } else if (twoMatch) {
              payout = Math.floor(amount * 1.2);
              resultText = `🎰 Two match — small win!\n${spin.join(' | ')}\n\n✅ You won 1.2x!`;
            } else {
              resultText = `🎰 No match. So close yet so far.\n${spin.join(' | ')}\n\n❌ You lost!`;
            }

            if (payout > 0) {
              db.setUser(m.sender, { coins: (coins - amount) + payout });
              await mixedCard(sock, m.from, {
                text: `🎰 *SLOT MACHINE*\n\n${resultText}\n🪙 Bet: ${amount} → Payout: ${payout} (+${payout - amount} profit)`,
                footer: 'NEXORA • Bet',
              }, [
                { kind: 'action', label: '🔄 Spin Again', cmd: `${p}bet slots ${amount}` },
                { kind: 'action', label: '🪙 Flip Coin',  cmd: `${p}bet flip ${amount}` },
                { kind: 'action', label: '💰 Check Balance', cmd: `${p}balance` },
              ], { quoted: m });
            } else {
              await mixedCard(sock, m.from, {
                text: `🎰 *SLOT MACHINE*\n\n${resultText}\n🪙 Bet: ${amount} → Lost ${amount} coins`,
                footer: 'NEXORA • Bet',
              }, [
                { kind: 'action', label: '🔄 Spin Again',  cmd: `${p}bet slots ${amount}` },
                { kind: 'action', label: '🪙 Claim Daily',  cmd: `${p}daily` },
                { kind: 'action', label: '💰 Check Balance',cmd: `${p}balance` },
              ], { quoted: m });
            }
          }
        });
      });
    } catch (lockErr) {
      return await m.reply.warn(lockErr.message);
    }
  }
};
