/**
 * @file src/plugins/economy/blackjack.js
 * .bj [bet] — blackjack against the house dealer.
 *
 * One game per player at a time; the hand lives on the user record
 * (`activeBj`) so Hit/Stand survive restarts. Buttons drive the follow-up
 * commands. Blackjack pays 3:2, dealer stands on 17.
 */

import { db } from '../../database/db.js';
import { withUserLock } from '../../economy/leveling.js';
import { commitAction } from '../../economy/actions.js';
import { withReactionStatus } from '../../lib/cosmetics.js';
import { richTableCard } from '../../lib/interactiveKit.js';

const MIN_BET = 25;
const MAX_BET = 50000;
const GAME_TTL_MS = 5 * 60 * 1000;

let PFX = '.';

const SUITS = ['♠️', '♥️', '♦️', '♣️'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function freshDeck() {
  const deck = [];
  for (let s = 0; s < 4; s++) for (let r = 0; r < 13; r++) deck.push(s * 13 + r);
  // Fisher-Yates
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

const cardStr = (code) => `${RANKS[code % 13]}${SUITS[Math.floor(code / 13)]}`;

function handValue(hand) {
  let total = 0, aces = 0;
  for (const c of hand) {
    const r = c % 13;
    if (r === 0) { aces++; total += 11; }
    else if (r >= 10) total += 10;
    else total += r + 1;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

const handStr = (hand, hideSecond = false) => hand
  .map((c, i) => (hideSecond && i === 1 ? '🂠' : cardStr(c)))
  .join(' ');

async function showTable(sock, m, game, phase, extra = {}) {
  const dealerShow = phase === 'done';
  const playerTotal = handValue(game.hand);
  const dealerTotal = dealerShow ? handValue(game.dealer) : handValue([game.dealer[0]]);
  const rows = [
    ['Your hand', `${handStr(game.hand)}  (${playerTotal})`],
    ['Dealer', `${handStr(game.dealer, !dealerShow)}  (${dealerShow ? dealerTotal : '?'})`],
    ['Bet', `🪙 ${game.bet.toLocaleString()}`],
  ];
  if (extra.row) rows.push(extra.row);
  try {
    await richTableCard(sock, m.from, {
      title: `🃏 BLACKJACK — ${phase === 'done' ? 'RESULT' : 'YOUR MOVE'}`,
      headers: ['', ''],
      rows,
      footer: extra.footer || 'Blackjack pays 3:2. Dealer stands on 17.',
      buttons: phase === 'done'
        ? [
            { label: 'Deal again', cmd: `${PFX}bj ${game.bet}` },
            { label: 'Balance', cmd: '.balance' },
          ]
        : [
            { label: 'Hit', cmd: `${PFX}bj hit` },
            { label: 'Stand', cmd: `${PFX}bj stand` },
            { label: 'Double down', cmd: `${PFX}bj double` },
          ],
    }, { quoted: m });
  } catch (_) {
    await m.reply(`${handStr(game.hand)} (${playerTotal}) vs ${handStr(game.dealer, !dealerShow)}\n${extra.footer ?? ''}`);
  }
}

function settle(m, game, outcome) {
  // outcome: 'player_bust' | 'dealer_bust' | 'player_win' | 'dealer_win' | 'push' | 'blackjack'
  const u = db.getUser(m.sender);
  let net = -game.bet;
  if (outcome === 'blackjack') net = Math.floor(game.bet * 1.5);
  else if (outcome === 'player_win' || outcome === 'dealer_bust') net = game.bet;
  else if (outcome === 'push') net = 0;

  const stats = {
    bjHands: (u.stats?.bjHands ?? 0) + 1,
    bjWins: (u.stats?.bjWins ?? 0) + (net > 0 ? 1 : 0),
  };
  const { result, lines } = commitAction(m.sender, {
    coinsDelta: net,
    xp: net > 0 ? Math.min(net, 40) : 0,
    stats,
    quest: 'bjWins',
    questN: net > 0 ? 1 : 0,
    extra: { activeBj: null },
  });

  const verdicts = {
    blackjack: '🎉 *BLACKJACK! Paid 3:2!*',
    player_win: '✅ You win!',
    dealer_bust: '💥 Dealer busts — you win!',
    dealer_win: '❌ Dealer wins this one.',
    player_bust: '💥 Bust! Dealer takes it.',
    push: '🤝 Push — bet returned.',
  };
  return {
    net,
    afterCoins: result.after.coins ?? 0,
    footer: `${verdicts[outcome]}\n🪙 ${net >= 0 ? '+' : ''}${net.toLocaleString()} coins (now ${(result.after.coins ?? 0).toLocaleString()})${lines.length ? '\n' + lines.join('\n') : ''}`,
  };
}

export default {
  name: 'blackjack',
  aliases: ['bj'],
  category: 'economy',
  description: 'Blackjack vs the dealer. .bj <bet> deals, then Hit / Stand / Double. Blackjack pays 3:2.',
  cooldown: 3000,
  execute: async ({ m, sock, prefix }) => {
    const p = prefix || '.';
    PFX = p;
    await withReactionStatus(m, async () => {
      try {
        await withUserLock(m.sender, async () => {
          const u = db.getUser(m.sender);
          const sub = String(m.args?.[0] ?? '').toLowerCase();

          // ── continue an in-progress hand ─────────────────────────────────
          const active = u.activeBj && (Date.now() - u.activeBj.ts) < GAME_TTL_MS ? u.activeBj : null;

          if (sub === 'hit' || sub === 'stand' || sub === 'double') {
            if (!active) return await m.reply.warn('No hand in progress. Deal with `.bj <bet>`.', 'BLACKJACK');
            if (sub === 'double') {
              if ((u.coins ?? 0) < active.bet) return await m.reply.warn('Not enough coins to double down.', 'BLACKJACK');
              active.bet *= 2;
              active.hand.push(active.deck.pop());
              const busted = handValue(active.hand) > 21;
              if (busted) {
                const s = settle(m, active, 'player_bust');
                return await showTable(sock, m, { ...active }, 'done', {
                  row: ['Result', `Bust with ${handValue(active.hand)} — doubled and lost. ${s.footer}`],
                });
              }
              // doubled and stood — fall through to dealer play below
              db.setUser(m.sender, { activeBj: active });
              return await dealerPlay(sock, m, active);
            }
            if (sub === 'hit') {
              active.hand.push(active.deck.pop());
              const v = handValue(active.hand);
              if (v > 21) {
                const s = settle(m, active, 'player_bust');
                return await showTable(sock, m, active, 'done', { row: ['Result', `Bust with ${v}! ${s.footer}`] });
              }
              if (v === 21) {
                db.setUser(m.sender, { activeBj: active });
                return await dealerPlay(sock, m, active);
              }
              db.setUser(m.sender, { activeBj: active });
              return await showTable(sock, m, active, 'move');
            }
            // stand
            db.setUser(m.sender, { activeBj: active });
            return await dealerPlay(sock, m, active);
          }

          // ── deal a new hand ────────────────────────────────────────────────
          if (active) {
            return await m.reply.warn(
              `You have a hand in progress!\n\n${handStr(active.hand)} (${handValue(active.hand)})\nUse *${p}bj hit* / *${p}bj stand* / *${p}bj double*.`,
              'BLACKJACK'
            );
          }
          if (u.jailUntil && Date.now() < u.jailUntil) {
            return await m.reply.warn('🚔 You\'re still in jail. No cards for you.', 'BLACKJACK');
          }

          const betNum = Math.floor(Number(m.args?.[0]));
          const bet = Number.isFinite(betNum) && betNum > 0 ? betNum : 50;
          if (bet < MIN_BET) return await m.reply.warn(`Minimum bet is ${MIN_BET} coins.`, 'BLACKJACK');
          if (bet > MAX_BET) return await m.reply.warn(`Maximum bet is ${MAX_BET.toLocaleString()} coins.`, 'BLACKJACK');
          if ((u.coins ?? 0) < bet) return await m.reply.warn(`Not enough coins. You have ${(u.coins ?? 0).toLocaleString()}.`, 'BLACKJACK');

          const deck = freshDeck();
          const hand = [deck.pop(), deck.pop()];
          const dealer = [deck.pop(), deck.pop()];

          // natural blackjack?
          if (handValue(hand) === 21) {
            const game = { hand, dealer, deck, bet, ts: Date.now() };
            const s = settle(m, game, 'blackjack');
            return await showTable(sock, m, game, 'done', { row: ['Result', s.footer] });
          }

          db.setUser(m.sender, { activeBj: { hand, dealer, deck, bet, ts: Date.now() } });
          await showTable(sock, m, { hand, dealer, bet }, 'move', {
            footer: `Buttons below — or ${p}bj hit / ${p}bj stand / ${p}bj double`,
          });
        });
      } catch (e) {
        if (String(e?.message).includes('transaction')) return await m.reply.warn(String(e.message), 'BLACKJACK');
        await m.reply.error(`Blackjack error: ${e.message}`);
      }
    });
  },
};

async function dealerPlay(sock, m, game) {
  // dealer draws to 17
  while (handValue(game.dealer) < 17) game.dealer.push(game.deck.pop());
  const dv = handValue(game.dealer);
  const pv = handValue(game.hand);
  let outcome;
  if (dv > 21) outcome = 'dealer_bust';
  else if (pv > dv) outcome = 'player_win';
  else if (dv > pv) outcome = 'dealer_win';
  else outcome = 'push';
  const s = settle(m, game, outcome);
  await showTable(sock, m, game, 'done', { row: ['Result', s.footer] });
}
