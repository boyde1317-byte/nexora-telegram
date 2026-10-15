/**
 * @file src/plugins/economy/crime.js
 * .crime — solo risky income. Weighted outcomes from petty mugging to
 * rare bank fraud; getting caught costs a fine and jail time.
 */

import { db } from '../../database/db.js';
import { withUserLock } from '../../economy/leveling.js';
import { commitAction } from '../../economy/actions.js';
import { withReactionStatus } from '../../lib/cosmetics.js';
import { richTableCard } from '../../lib/interactiveKit.js';

const COOLDOWN_MS = 5 * 60 * 1000;

// weighted outcome table: chance, reward range, jail minutes on fail (0 = no jail)
const OUTCOMES = [
  { label: 'mugged a tourist for their sneakers',                    chance: 0.30, min: 60,   max: 250,  jail: 0 },
  { label: 'ran a fake giveaway scam',                              chance: 0.25, min: 120,  max: 350,  jail: 2 },
  { label: 'pickpocketed a wedding reception',                      chance: 0.15, min: 250,  max: 600,  jail: 2 },
  { label: 'sold "premium" accounts to a bot farmer',                chance: 0.10, min: 400,  max: 800,  jail: 4 },
  { label: 'cloned a VIP sim card ring',                             chance: 0.06, min: 600,  max: 1200, jail: 5 },
  { label: 'pulled a bank fraud with insider intel',                 chance: 0.02, min: 1500, max: 3000, jail: 6 },
];
const CAUGHT_LINES = [
  'got ID\'d by a CCTV camera in 4K',
  'tripped over their own shoelaces in front of a patrol car',
  'got grassed on by their own cousin',
  'posted the evidence on their status with location on',
];

function pickOutcome() {
  const roll = Math.random();
  let acc = 0;
  for (const o of OUTCOMES) { acc += o.chance; if (roll < acc) return o; }
  return null; // fail branch
}

export default {
  name: 'crime',
  aliases: ['hustle'],
  category: 'economy',
  description: 'Commit a crime for quick coins. Fail = fine + possible jail. 5min cooldown.',
  cooldown: 4000,
  execute: async ({ m, sock, prefix }) => {
    const p = prefix || '.';
    await withReactionStatus(m, async () => {
      try {
        await withUserLock(m.sender, async () => {
          const u = db.getUser(m.sender);
          const now = Date.now();

          if (u.jailUntil && now < u.jailUntil) {
            return await m.reply.warn('🚔 You\'re still in jail. Even criminals get lunch breaks.', 'CRIME');
          }
          if (u.lastCrime && now - u.lastCrime < COOLDOWN_MS) {
            const min = Math.ceil((COOLDOWN_MS - (now - u.lastCrime)) / 60000);
            return await m.reply.warn(`Lay low for *${min} more min*. The streets are watching.`, 'CRIME');
          }

          const outcome = pickOutcome();

          if (outcome) {
            const reward = Math.floor(outcome.min + Math.random() * (outcome.max - outcome.min));
            const stats = {
              crimes: (u.stats?.crimes ?? 0) + 1,
              crimeWins: (u.stats?.crimeWins ?? 0) + 1,
            };
            const { result, lines } = commitAction(m.sender, {
              coinsDelta: reward,
              xp: 10,
              stats,
              quest: 'crimeWins',
              extra: { lastCrime: now },
            });
            try {
              await richTableCard(sock, m.from, {
                title: '🕶️ CRIME PAYS',
                headers: ['', ''],
                rows: [
                  ['Job', `You ${outcome.label}`],
                  ['Take', `🪙 +${reward.toLocaleString()}`],
                  ['Balance', `🪙 ${(result.after.coins ?? 0).toLocaleString()}`],
                ],
                footer: lines.length ? lines.join('\n') : `Cooldown: 5 min. ${p}crime again later.`,
                buttons: [
                  { label: 'Crime again (in 5m)', cmd: `${p}crime` },
                  { label: 'Balance', cmd: `${p}balance` },
                ],
              }, { quoted: m });
            } catch (_) {
              await m.reply(`🕶️ You ${outcome.label} — 🪙 +${reward.toLocaleString()} coins!${lines.length ? '\n' + lines.join('\n') : ''}`);
            }
          } else {
            const caught = CAUGHT_LINES[Math.floor(Math.random() * CAUGHT_LINES.length)];
            const fine = Math.min((u.coins ?? 0), 50 + Math.floor(Math.random() * 300));
            const jailMin = 2 + Math.floor(Math.random() * 3); // 2–4 min
            const stats = {
              crimes: (u.stats?.crimes ?? 0) + 1,
              jails: (u.stats?.jails ?? 0) + 1,
            };
            commitAction(m.sender, {
              coinsDelta: -fine,
              stats,
              extra: { lastCrime: now, jailUntil: now + jailMin * 60000 },
            });
            await m.reply.warn(
              `🚨 *You got caught!* You ${caught}.\n💸 Fine: ${fine.toLocaleString()} coins\n🚔 Jail: *${jailMin} minutes*`,
              'CRIME FAILED'
            );
          }
        });
      } catch (e) {
        if (String(e?.message).includes('transaction')) return await m.reply.warn(String(e.message), 'CRIME');
        await m.reply.error(`Crime error: ${e.message}`);
      }
    });
  },
};
