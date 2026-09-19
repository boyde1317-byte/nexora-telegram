/**
 * wordchain.js — Multiplayer word chain game for group chats.
 *
 * Players take turns saying a word that starts with the last letter of
 * the previous word. No repeats. 30s per turn. Uses the bot's economy
 * system to reward the winner.
 *
 * Usage:
 *   .wordchain start       — Start a new game in the current group
 *   .wordchain join        — Join an active game
 *   .wordchain stop        — Stop the current game (owner/admin only)
 *   .wordchain <word>      — Submit your word when it's your turn
 */
import { mixedCard, richTableCard } from '../../lib/interactiveKit.js';
import { asciiBuilder } from '../../ui/asciiBuilder.js';
import { grantXp } from '../../economy/leveling.js';

const TURN_TIMEOUT_MS = 30000;
const WIN_COINS = 100;
const WIN_XP    = 50;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;

// In-memory game state per group
const games = new Map();

function getGame(jid) {
  return games.get(jid);
}

function setGame(jid, game) {
  games.set(jid, game);
}

function deleteGame(jid) {
  games.delete(jid);
}

function getLastLetter(word) {
  // Skip non-alpha at the end
  for (let i = word.length - 1; i >= 0; i--) {
    if (/[a-zA-Z]/.test(word[i])) return word[i].toLowerCase();
  }
  return null;
}

export default {
  name: 'wordchain',
  aliases: ['wc', 'chain', 'shiritori'],
  category: 'games',
  description: 'Word chain game for groups. Start with .wordchain start, join with .wordchain join.',
  cooldown: 2000,
  groupOnly: true,
  execute: async ({ m, sock, db, args, prefix, isGroupMsg }) => {
    const p = prefix || '.';
    const subCmd = args[0]?.toLowerCase();

    // ── Scores ──────────────────────────────────────────────────────────
    if (subCmd === 'scores' || subCmd === 'score' || subCmd === 'top') {
      const game = getGame(m.from);
      if (!game) return await m.reply.info(`No active game — scores appear once a chain is running. Start with \`${p}wordchain start\`.`);
      if (game.phase !== 'playing') return await m.reply.info(`The game is still in the lobby — \`${p}wordchain go\` to begin.`);
      const log = game.log || [];
      const rows = game.players.map(jid => ({ jid, n: log.filter(e => e.sender === jid).length }));
      if (!log.length) return await m.reply.info('No words played yet — the table fills as the chain grows.');
      await m.react('🏆');
      return await richTableCard(sock, m.from, {
        title: `🏆 WORD CHAIN — SCORES (${log.length} word${log.length !== 1 ? 's' : ''})`,
        headers: ['#', 'Player', 'Words', 'Last word'],
        rows: rows.sort((a, b) => b.n - a.n).map((r, i) => [
          String(i + 1),
          '+' + r.jid.split('@')[0].split(':')[0],
          String(r.n),
          (log.filter(e => e.sender === r.jid).slice(-1)[0]?.word || '—'),
        ]),
        footer: `Chain length: ${game.words.length} • Current streak letter: ${(game.lastWord?.slice(-1) || '?').toUpperCase()}`,
      }, { quoted: m });
    }

    // ── Start ──────────────────────────────────────────────────────────
    if (subCmd === 'start') {
      const existing = getGame(m.from);
      if (existing && existing.phase === 'playing') {
        return await m.reply.warn('A word chain game is already in progress. Join with `.wordchain join`.');
      }
      if (existing && existing.phase === 'lobby') {
        return await m.reply.info('A game is waiting for players. Join with `.wordchain join`.');
      }

      setGame(m.from, {
        phase: 'lobby',
        players: [m.sender],
        currentTurn: 0,
        words: [],
        log: [],
        lastWord: null,
        timeout: null,
        startedAt: Date.now(),
      });

      return await mixedCard(sock, m.from, {
        text: `🔗 *WORD CHAIN*\n\nGame started! Who\'s got the vocabulary for this?\n\nPlayers: 1/${MAX_PLAYERS}\n\nType \`${p}wordchain join\` to play! ✦`,
        footer: 'NEXORA • Word Chain',
      }, [
        { kind: 'action', label: '🔗 Join Game',  cmd: `${p}wordchain join` },
        { kind: 'action', label: '🚀 Start Now',  cmd: `${p}wordchain go` },
      ], { quoted: m });
    }

    // ── Join ───────────────────────────────────────────────────────────
    if (subCmd === 'join') {
      const game = getGame(m.from);
      if (!game) {
        return await m.reply.info(`No active game. Start one with \`${p}wordchain start\`.`);
      }
      if (game.phase !== 'lobby') {
        return await m.reply.warn('This game has already started. Wait for the next one!');
      }
      if (game.players.includes(m.sender)) {
        return await m.reply.warn('You already joined!');
      }
      if (game.players.length >= MAX_PLAYERS) {
        return await m.reply.error('The game is full!');
      }

      game.players.push(m.sender);

      const playerNums = game.players.map(jid => `+${jid.split('@')[0].split(':')[0]}`).join(', ');
      await m.reply(`🔗 Player joined! (${game.players.length}/${MAX_PLAYERS})\nPlayers: ${playerNums}\n\nType \`${p}wordchain go\` when everyone's ready!`);
    }

    // ── Go (start playing) ──────────────────────────────────────────────
    if (subCmd === 'go') {
      const game = getGame(m.from);
      if (!game) {
        return await m.reply.info(`No active game. Start one with \`${p}wordchain start\`.`);
      }
      if (game.phase !== 'lobby') {
        return await m.reply.warn('The game has already started!');
      }
      if (game.players.length < MIN_PLAYERS) {
        return await m.reply.error(`Need at least ${MIN_PLAYERS} players to start. Currently ${game.players.length}.`);
      }

      game.phase = 'playing';
      game.currentTurn = 0;
      game.lastWord = null;
      game.words = [];

      // Pick a random starting letter
      const startLetter = String.fromCharCode(97 + Math.floor(Math.random() * 26));
      const currentPlayer = game.players[0];
      const playerNum = currentPlayer.split('@')[0].split(':')[0];

      // Set turn timeout
      setTurnTimeout(m.from, sock, db, p);

      return await mixedCard(sock, m.from, {
        text: `🔗 *WORD CHAIN — GO!*\n\nStarting letter: *${startLetter.toUpperCase()}*\n\n👤 Current turn: +${playerNum}\n\nType a word starting with *${startLetter.toUpperCase()}* — use \`${p}wordchain <word>\`\n⏱️ 30s per turn. Don\'t blank out. ✦`,
        footer: `${game.players.length} players • Last one standing wins ${WIN_COINS} 🪙`,
      }, [
        { kind: 'action', label: '🛑 Stop Game', cmd: `${p}wordchain stop` },
      ], { quoted: m });
    }

    // ── Stop ────────────────────────────────────────────────────────────
    if (subCmd === 'stop') {
      const game = getGame(m.from);
      if (!game) {
        return await m.reply.info('No active game to stop.');
      }
      deleteGame(m.from);
      return await m.reply.success('🛑 Word chain stopped. All that brainpower, wasted. 😏');
    }

    // ── Submit a word ───────────────────────────────────────────────────
    if (subCmd && subCmd !== 'start' && subCmd !== 'join' && subCmd !== 'go' && subCmd !== 'stop') {
      const game = getGame(m.from);
      if (!game || game.phase !== 'playing') {
        return await m.reply.info(`No active game. Start one with \`${p}wordchain start\`.`);
      }

      const word = args.join(' ').toLowerCase().trim();

      // Check if it's the player's turn
      if (game.players[game.currentTurn] !== m.sender) {
        const currentPlayer = game.players[game.currentTurn];
        return await m.reply.warn(`It's not your turn! Current turn: +${currentPlayer.split('@')[0].split(':')[0]}`);
      }

      // Check first letter matches
      const requiredLetter = game.lastWord
        ? getLastLetter(game.lastWord)
        : word[0]; // First turn accepts any word

      if (game.lastWord && word[0] !== requiredLetter) {
        eliminatePlayer(m.from, sock, db, p, game, m.sender, `Word must start with *${requiredLetter.toUpperCase()}*`);
        return;
      }

      // Check no repeats
      if (game.words.includes(word)) {
        eliminatePlayer(m.from, sock, db, p, game, m.sender, `*${word}* was already used!`);
        return;
      }

      // Valid word — record it and pass the turn
      game.words.push(word);
      (game.log ||= []).push({ word, sender: m.sender });
      game.lastWord = word;
      game.currentTurn = (game.currentTurn + 1) % game.players.length;

      // Clear old timeout and set new one
      if (game.timeout) clearTimeout(game.timeout);
      setTurnTimeout(m.from, sock, db, p);

      const nextPlayer = game.players[game.currentTurn];
      const nextLetter = getLastLetter(word);
      const wordCount = game.words.length;
      const streakNote = wordCount >= 10 ? ' 🔥 This chain is getting long!' : wordCount >= 5 ? ' ✦ Nice chain!' : '';
      await m.reply(`✅ *${word}* accepted!${streakNote}\n\n👤 Next: +${nextPlayer.split('@')[0].split(':')[0]} — word starts with *${nextLetter?.toUpperCase()}*`);
    }
  }
};

function setTurnTimeout(jid, sock, db, prefix) {
  const game = getGame(jid);
  if (!game) return;

  game.timeout = setTimeout(async () => {
    const g = getGame(jid);
    if (!g || g.phase !== 'playing') return;

    const timedOut = g.players[g.currentTurn];
    eliminatePlayer(jid, sock, db, prefix, g, timedOut, '⏰ Time is up!');
  }, TURN_TIMEOUT_MS);
}

function eliminatePlayer(jid, sock, db, prefix, game, playerJid, reason) {
  const playerNum = playerJid.split('@')[0].split(':')[0];

  if (game.timeout) clearTimeout(game.timeout);

  game.players = game.players.filter(p => p !== playerJid);

  if (game.players.length <= 1) {
    // Game over — someone won
    const winner = game.players[0];
    deleteGame(jid);

    if (winner) {
      const winnerNum = winner.split('@')[0].split(':')[0];
      const userData = db.getUser(winner);
      const coins = (userData.coins ?? 0) + WIN_COINS;
      grantXp(db, winner, { xp: WIN_XP, coins: WIN_COINS });

      sock.sendMessage(jid, {
        text: `🏆 *WORD CHAIN — GAME OVER!*\n\n👤 +${playerNum} is out: ${reason}\n\n🎉 *Winner: +${winnerNum}!* 🧠\nWordsmith extraordinaire.\n🪙 +${WIN_COINS} coins\n✨ +${WIN_XP} XP\n\nType \`${prefix}wordchain start\` to play again!`,
      });
    }
    return;
  }

  // Fix turn index after removal
  game.currentTurn = game.currentTurn % game.players.length;
  const nextPlayer = game.players[game.currentTurn];
  const nextLetter = game.lastWord ? getLastLetter(game.lastWord) : null;

  sock.sendMessage(jid, {
    text: `❌ +${playerNum} is out: ${reason}\n\n${game.players.length} players remaining.\n\n👤 Next: +${nextPlayer.split('@')[0].split(':')[0]}${nextLetter ? ` — word starts with *${nextLetter.toUpperCase()}*` : ''}`,
  });

  setTurnTimeout(jid, sock, db, prefix);
}
