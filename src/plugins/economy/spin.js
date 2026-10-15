/**
 * @file src/plugins/economy/spin.js
 * .spin — the daily wheel. One free spin a day (retention hook), extra
 * spins cost coins. Weighted prizes with a rare jackpot.
 */

import { db } from '../../database/db.js';
import { withUserLock } from '../../economy/leveling.js';
import { commitAction } from '../../economy/actions.js';
import { withReactionStatus } from '../../lib/cosmetics.js';
import { richTableCard } from '../../lib/interactiveKit.js';

const FREE_SPIN_MS = 24 * 60 * 60 * 1000;
const EXTRA_SPIN_COST = 250;

// weighted wheel segments: [label, kind, amount, weight]
const SEGMENTS = [
  { emoji: '🪙', label: 'Small purse',     kind: 'coins', amount: 50,   weight: 24 },
  { emoji: '💵', label: 'Folded money',    kind: 'coins', amount: 120,  weight: 20 },
  { emoji: '💰', label: 'Lucky bag',       kind: 'coins', amount: 300,  weight: 12 },
  { emoji: '✨', label: 'XP surge',        kind: 'xp',    amount: 80,   weight: 12 },
  { emoji: '🪙', label: 'Big stack',       kind: 'coins', amount: 600,  weight: 7 },
  { emoji: '✨', label: 'XP avalanche',    kind: 'xp',    amount: 200,  weight: 5 },
  { emoji: '💎', label: 'VAULT JACKPOT',   kind: 'coins', amount: 2000, weight: 2 },
  { emoji: '💤', label: 'Nothing today',   kind: 'none',  amount: 0,    weight: 18 },
];
const TOTAL = SEGMENTS.reduce((a, s) => a + s.weight, 0);

function spinWheel() {
  let roll = Math.random() * TOTAL;
  for (const seg of SEGMENTS) {
    roll -= seg.weight;
    if (roll <= 0) return seg;
  }
  return SEGMENTS[SEGMENTS.length - 1];
}

const wheelStrip = () => SEGMENTS.map(s => s.emoji).join(' • ');

export default {
  name: 'spin',
  aliases: ['wheel', 'dailywheel'],
  category: 'economy',
  description: 'Free daily spin of the wheel! Extra spins cost 250 coins. Vault jackpot: 2000 coins.',
  cooldown: 4000,
  execute: async ({ m, sock, prefix }) => {
    const p = prefix || '.';
    await withReactionStatus(m, async () => {
      try {
        await withUserLock(m.sender, async () => {
          const u = db.getUser(m.sender);
          const now = Date.now();
          const sub = String(m.args?.[0] ?? '').toLowerCase();

          const freeAvailable = !u.lastSpin || now - u.lastSpin >= FREE_SPIN_MS;
          const isExtra = sub === 'extra' || sub === 'again';

          if (!freeAvailable && !isExtra) {
            const h = Math.floor((FREE_SPIN_MS - (now - (u.lastSpin ?? 0))) / 3600000);
            const min = Math.floor(((FREE_SPIN_MS - (now - (u.lastSpin ?? 0))) % 3600000) / 60000);
            return await m.reply.warn(
              `Free spin used! Next free spin in *${h}h ${min}m*.\nOr buy one now: *${p}spin extra* (${EXTRA_SPIN_COST} coins)`,
              'SPIN'
            );
          }
          if (isExtra && (u.coins ?? 0) < EXTRA_SPIN_COST) {
            return await m.reply.warn(`Extra spins cost ${EXTRA_SPIN_COST} coins — you have ${(u.coins ?? 0).toLocaleString()}.`, 'SPIN');
          }

          const cost = isExtra ? EXTRA_SPIN_COST : 0;
          const seg = spinWheel();
          const isJackpot = seg.label === 'VAULT JACKPOT';

          const coinsDelta = seg.kind === 'coins' ? seg.amount - cost : -cost;
          const stats = {
            spins: (u.stats?.spins ?? 0) + 1,
            jackpots: (u.stats?.jackpots ?? 0) + (isJackpot ? 1 : 0),
          };
          const { result, lines } = commitAction(m.sender, {
            coinsDelta,
            xp: seg.kind === 'xp' ? seg.amount : 5,
            stats,
            quest: 'spins',
            extra: { lastSpin: isExtra ? (u.lastSpin ?? 0) : now },
          });

          const prizeLine =
            seg.kind === 'coins' ? `🪙 +${seg.amount.toLocaleString()} coins` :
            seg.kind === 'xp' ? `✨ +${seg.amount} XP` :
            '💤 ...and the wheel laughed at you.';

          try {
            await richTableCard(sock, m.from, {
              title: isJackpot ? '🎡 WHEEL — 💎 VAULT JACKPOT!!! 🎉' : '🎡 DAILY WHEEL',
              headers: ['', ''],
              rows: [
                ['Wheel', wheelStrip()],
                ['Landed on', `${seg.emoji} ${seg.label}`],
                ['Prize', prizeLine],
                ['Cost', cost ? `-${cost} (extra spin)` : 'Free spin'],
                ['Balance', `🪙 ${(result.after.coins ?? 0).toLocaleString()}`],
              ],
              footer: lines.length ? lines.join('\n') : (freeAvailable && !isExtra ? 'Come back tomorrow for a free one!' : `Another go: ${p}spin extra`),
              buttons: [
                { label: 'Spin again (250c)', cmd: `${p}spin extra` },
                { label: 'Balance', cmd: `${p}balance` },
                { label: 'Quests', cmd: `${p}quests` },
              ],
            }, { quoted: m });
          } catch (_) {
            await m.reply(`${seg.emoji} ${seg.label} — ${prizeLine}${lines.length ? '\n' + lines.join('\n') : ''}`);
          }
        });
      } catch (e) {
        if (String(e?.message).includes('transaction')) return await m.reply.warn(String(e.message), 'SPIN');
        await m.reply.error(`Spin error: ${e.message}`);
      }
    });
  },
};
