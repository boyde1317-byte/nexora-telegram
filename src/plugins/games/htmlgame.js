/**
 * htmlgame.js — in-chat HTML5 games via GenAIaeacdsnwHtmlPrimitive.
 *
 * These render INSIDE the message card on modern clients: full canvas
 * games (dino runner, chess, highway/space rush, tic-tac-toe), a working
 * calculator, and a live server-monitor card. Older clients fall back to
 * the game title text.
 *
 * Usage:
 *   .game               → native select picker with all games
 *   .game dino           → launch a game by key (or alias: highway, spacerush, serverinfo)
 */
import { selectMenu } from '../../lib/interactiveKit.js';
import { HTML_GAMES, sendHtmlGame } from '../../lib/htmlGames.js';

export default {
  name: 'game',
  aliases: ['htmlgame', 'play'],
  category: 'games',
  description: '🎮 In-chat HTML5 games. Usage: .game [dino/chess/mbim/plane/ttc/calc/monitor]',
  cooldown: 5000,

  execute: async ({ sock, m, args, prefix }) => {
    const p = prefix || '.';

    // ── No arg — select picker of all games ─────────────────────────────
    if (!args[0]) {
      const rows = Object.entries(HTML_GAMES).map(([key, g]) => ({
        id: `${p}game ${key}`,
        title: g.title,
        description: g.desc,
      }));
      return await selectMenu(sock, m.from, {
        text: '🎮 *NEXORA In-Chat Games*\n\nReal HTML5 games rendered inside the message — tap and play. No browser needed.',
        footer: 'NEXORA • HTML Games • GenAIaeacdsnwHtmlPrimitive',
      }, '🎮 Choose a game', [{ title: 'Games & Tools', rows }], [], { quoted: m });
    }

    // ── Launch a game ────────────────────────────────────────────────────
    const name = args[0].toLowerCase();
    const result = await sendHtmlGame(sock, m.from, { game: name, quoted: m });

    if (!result.ok) {
      const keys = Object.entries(HTML_GAMES)
        .map(([k, g]) => `${k}${g.alias ? ` (${g.alias})` : ''}`)
        .join(', ');
      return await m.reply.error(
        `Unknown game: *"${name}"*\n\nAvailable: ${keys}\n\n_Usage: ${p}game <name>_`
      );
    }
  },
};
