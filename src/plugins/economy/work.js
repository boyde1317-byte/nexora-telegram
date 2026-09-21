/**
 * work.js — hourly odd jobs with random payouts.
 *
 * Cute single-card result + interactive buttons, consistent with the
 * profile/daily style. Payout scales slightly with level so it stays
 * worth doing as you rank up.
 */
import { withReactionStatus } from '../../lib/cosmetics.js';
import { grantXp, withUserLock } from '../../economy/leveling.js';
import { actionCard } from '../../lib/interactiveKit.js';

const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

const JOBS = [
  { emoji: '☕',  job: 'barista duty',    base: 45, xp: 15, quip: 'served the perfect latte art' },
  { emoji: '🛒',  job: 'shopping carts', base: 40, xp: 15, quip: 'herded every stray cart' },
  { emoji: '🍕',  job: 'pizza delivery', base: 55, xp: 20, quip: 'delivered hot, got a fat tip' },
  { emoji: '🐕',  job: 'dog walking',     base: 50, xp: 15, quip: 'survived six hyper huskies' },
  { emoji: '💻',  job: 'freelance gigs',  base: 70, xp: 25, quip: 'shipped code, billed the client' },
  { emoji: '🧹',  job: 'group cleaning',  base: 42, xp: 15, quip: 'swept the whole lobby' },
  { emoji: '🎨',  job: 'comm commissions', base: 65, xp: 20, quip: 'drew someone\'s OC perfectly' },
  { emoji: '🚕',  job: 'late-night taxi', base: 58, xp: 18, quip: 'beat the traffic, kept the meter running' },
];

function msToHm(ms) {
  const m = Math.max(1, Math.round(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

export default {
  name: 'work',
  aliases: ['job', 'shift'],
  category: 'economy',
  description: 'Work an odd job for coins + XP. 1 hour cooldown.',
  cooldown: 3000,
  execute: async ({ m, sock, db, prefix }) => {
    const p = prefix || '.';
    await withReactionStatus(m, async () => {
      await withUserLock(m.sender, async () => {
        const user = db.getUser(m.sender);
        const now = Date.now();
        const lastWork = user.lastWork ?? 0;

        if (now - lastWork < COOLDOWN_MS) {
          const left = msToHm(COOLDOWN_MS - (now - lastWork));
          try {
            return await actionCard(sock, m.from, {
              text: `😴 *Not yet — the boss says rest*\n\n${user.coins?.toLocaleString() ?? 0} coins in the bag. Come back in *${left}*.`,
              footer: 'NEXORA • Work',
            }, [
              { label: '💰 Daily',       cmd: `${p}daily` },
              { label: '⚖️ Balance',     cmd: `${p}balance` },
              { label: '👤 Profile',     cmd: `${p}me` },
            ], { quoted: m });
          } catch (_) {
            return await m.reply(`😴 Not yet — come back in *${left}*.`);
          }
        }

        // Payout: random 80–125% of base, scaled +5% per level (capped)
        const job = JOBS[Math.floor(Math.random() * JOBS.length)];
        const level = user.level ?? 0;
        const scale = 1 + Math.min(level, 40) * 0.05;
        const coins = Math.round(job.base * scale * (0.8 + Math.random() * 0.45));
        const xp = job.xp;

        const res = grantXp(db, m.sender, { coins, xp }, { lastWork: now });

        const lines = [
          '✧･ﾟ: *PAYDAY* :･ﾟ✧',
          '',
          `${job.emoji} You took *${job.job}* and ${job.quip}.`,
          '',
          `🪙 *+${coins.toLocaleString()}* coins ・ ✨ *+${xp}* XP`,
          `⚖️ Wallet: *${res.after.coins.toLocaleString()}* coins`,
          ...(res.leveledUp ? ['', `🎉 *LEVEL UP!* → Level *${res.after.level}*`] : []),
          '',
          `⏳ Next shift in *1h*`,
        ];

        try {
          return await actionCard(sock, m.from, {
            text: lines.join('\n'),
            footer: 'NEXORA • Work',
          }, [
            { label: '🎰 Try Slots',      cmd: `${p}slots` },
            { label: '🏆 Leaderboard',    cmd: `${p}top` },
            { label: '🛍️ Shop',           cmd: `${p}shop` },
          ], { quoted: m });
        } catch (_) {
          return await m.reply(lines.join('\n'));
        }
      });
    });
  },
};
