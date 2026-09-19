import { mixedCard } from '../../lib/interactiveKit.js';

export default {
  name: 'flip',
  aliases: ['coinflip', 'coin'],
  category: 'fun',
  description: 'Flip a coin. Usage: .flip [heads|tails] [bet amount]',
  cooldown: 3000,
  execute: async ({ sock, m, args, db, prefix }) => {
    const p = prefix || '.';
    const outcome = Math.random() < 0.5 ? 'Heads' : 'Tails';

    // Check if user is trying to bet
    const guess = args[0]?.toLowerCase();
    const betAmount = parseInt(args[1], 10);

    if (guess && ['heads', 'tails', 'h', 't'].includes(guess) && betAmount) {
      // ── Bet mode ──────────────────────────────────────────────────────
      const normalizedGuess = guess.startsWith('h') ? 'Heads' : 'Tails';
      const win = outcome === normalizedGuess;

      const userData = db.getUser(m.sender);
      const coins = userData.coins ?? 0;

      if (coins < betAmount) {
        return await m.reply.error(`Not enough coins! You have ${coins.toLocaleString()} but tried to bet ${betAmount}.`);
      }

      if (win) {
        db.setUser(m.sender, { coins: coins + betAmount });
        await mixedCard(sock, m.from, {
          text: `✦ *COIN FLIP — BET* ✦\n\n🪙 Result: *${outcome}*\nYour guess: ${normalizedGuess}\n\n✅ You won! Lady luck likes you.\n🪙 +${betAmount} coins (${(coins + betAmount).toLocaleString()} total)`,
          footer: 'NEXORA • Coin Flip',
        }, [
          { kind: 'action', label: '🔄 Flip Again', cmd: `${p}flip ${guess} ${betAmount}` },
          { kind: 'action', label: '💰 Balance', cmd: `${p}balance` },
        ], { quoted: m });
      } else {
        db.setUser(m.sender, { coins: coins - betAmount });
        await mixedCard(sock, m.from, {
          text: `✦ *COIN FLIP — BET* ✦\n\n🪙 Result: *${outcome}*\nYour guess: ${normalizedGuess}\n\n❌ You lost! The coin giveth, the coin taketh away.\n🪙 -${betAmount} coins (${(coins - betAmount).toLocaleString()} total)`,
          footer: 'NEXORA • Coin Flip',
        }, [
          { kind: 'action', label: '🔄 Try Again', cmd: `${p}flip ${guess} ${betAmount}` },
          { kind: 'action', label: '🪙 Daily', cmd: `${p}daily` },
          { kind: 'action', label: '💰 Balance', cmd: `${p}balance` },
        ], { quoted: m });
      }
      return;
    }

    // ── Normal flip (no bet) ────────────────────────────────────────────
    await mixedCard(sock, m.from, {
      text: `✦ *COIN FLIP* ✦\n\n🪙 The coin landed on: *${outcome}*\n${outcome === 'Heads' ? 'Heads I win, tails you lose. Just kidding. ☕' : 'Tails never fails. ⚡'}`,
      footer: 'NEXORA • Coin Flip'
    }, [
      { kind: 'action', label: '🔄 Flip Again', cmd: `${p}flip` },
      { kind: 'action', label: '💰 Bet Coins', cmd: `${p}bet flip 50` },
    ], { quoted: m });
  }
};
