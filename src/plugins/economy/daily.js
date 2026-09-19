/**
 * daily.js — daily reward claim with streak system.
 *
 * After a successful claim, sends a richResponse table with the reward breakdown
 * + an actionCard with economy follow-up buttons (balance, leaderboard, shop).
 */
import { withReactionStatus, getBrandThumbnail} from '../../lib/cosmetics.js';
import { grantXp, getLevelProgress, progressBar, withUserLock} from '../../economy/leveling.js';
import { richTableCard, actionCardWithAd} from '../../lib/interactiveKit.js';
import { messageFormatter} from '../../ui/messageFormatter.js';
import { asciiBuilder} from '../../ui/asciiBuilder.js';
import { buildEnrichedContextInfo} from '../../lib/enrichContext.js';

const COOLDOWN_MS  = 24 * 60 * 60 * 1000;
const BASE_COINS   = 100;
const BASE_XP      = 50;
const STREAK_BONUS = 0.10;
const MAX_STREAK   = 30;

export default {
  name: 'daily',
  aliases: ['claim', 'dailyreward', 'checkin'],
  category: 'economy',
  description: 'Claim your daily reward. Streak bonuses stack up to 30 days (+10% per day).',
  cooldown: 3000,
  execute: async ({ m, sock, db, prefix }) => {
    const p = prefix || '.';
    await withReactionStatus(m, async () => {
      try {
        await withUserLock(m.sender, async () => {
      const userData  = db.getUser(m.sender);
      const now       = Date.now();
      const lastClaim = userData.lastDaily ?? 0;
      const elapsed   = now - lastClaim;

      if (elapsed < COOLDOWN_MS) {
        const remaining = COOLDOWN_MS - elapsed;
        const h   = Math.floor(remaining / 3600000);
        const min = Math.floor((remaining % 3600000) / 60000);

        // Cooldown — show next-claim info + actionCardWithAd with other economy options
        try {
          const thumbnailUrl = await getBrandThumbnail();
          return await actionCardWithAd(sock, m.from, {
            text:   messageFormatter.warn(`Already claimed today!\n\n⏰ Next claim in *${h}h ${min}m*`, 'DAILY REWARD'),
            footer: `Streak: ${userData.streak ?? 0} day${(userData.streak ?? 0) !== 1 ? 's' : ''}`,
          }, [
            { label: 'Check Balance',     cmd: `${p}balance` },
            { label: 'Leaderboard',       cmd: `${p}top` },
            { label: 'Coin Shop',          cmd: `${p}shop` },
          ], {
            title: 'DAILY REWARD',
            body:  `Streak: ${userData.streak ?? 0} day${(userData.streak ?? 0) !== 1 ? 's' : ''}`,
            thumbnailUrl,
            originalImageUrl: thumbnailUrl,
          }, { quoted: m });
        } catch (_) {
          return await m.reply.warn(
            `You already claimed today!\n\n⏰ Next claim in *${h}h ${min}m*`, 'DAILY REWARD'
          );
        }
      }

      // Streak: within 48h → continue, else reset
      const prevStreak = userData.streak ?? 0;
      const streak     = elapsed < COOLDOWN_MS * 2 ? Math.min(prevStreak + 1, MAX_STREAK) : 1;
      const multiplier = 1 + (streak - 1) * STREAK_BONUS;
      const coins      = Math.floor(BASE_COINS * multiplier);
      const xp         = Math.floor(BASE_XP   * multiplier);

      const result = grantXp(db, m.sender, { xp, coins }, { lastDaily: now, streak });
      const { leveledUp, after } = result;
      const progress = getLevelProgress(after.xp);
      const bar = progressBar(progress.xpIntoLevel, progress.nextLevelXp - progress.currentLevelXp);

      const bonusPct = Math.round((multiplier - 1) * 100);

      // ── Tier 1: richResponse table + economy actionCard ──────────────────
      try {
        await richTableCard(sock, m.from, {
          title:   '💰 DAILY REWARD CLAIMED',
          headers: ['Reward', 'Amount'],
          rows: [
            ['🪙 Coins',    `+${coins} → ${after.coins.toLocaleString()} total`],
            ['✨ XP',       `+${xp} → ${after.xp.toLocaleString()} total`],
            ['🔥 Streak',   `${streak} day${streak !== 1 ? 's' : ''}${bonusPct ? ` (+${bonusPct}% bonus)` : ''}`],
            ['🏅 Level',    String(after.level)],
            ['📊 Progress', bar],
            ...(leveledUp        ? [['🎉 Level Up!', `You are now Level ${after.level}!`]]         : []),
            ...(streak===MAX_STREAK ? [['🏆 Max Streak', 'Achievement unlocked! Keep it up!']] : []),
          ],
          footer: `Same time tomorrow. Don't break the streak. 🔥`,
        }, { quoted: m });
        return;
      } catch (err) {
        console.warn('[daily] Tier 1 (richTable) failed:', err.message);
      }

      // ── Tier 2: plain text fallback ───────────────────────────────────────
      const lines = [
        `🪙 Coins    : +${coins} → Total ${after.coins.toLocaleString()}`,
        `✨ XP       : +${xp} → Total ${after.xp.toLocaleString()}`,
        `🔥 Streak   : ${streak} day${streak !== 1 ? 's' : ''} (+${bonusPct}% bonus)`,
        `🏅 Level    : ${after.level}`,
        `📊 Progress : ${bar}`,
        ...(leveledUp ? ['', `🎉 *LEVEL UP! You are now Level ${after.level}!*`] : []),
        ...(streak === MAX_STREAK ? ['', `🏆 *MAX STREAK! Keep it up!*`] : []),
      ];
      await m.reply(asciiBuilder.box('💰 DAILY REWARD CLAIMED', lines), { contextInfo: buildEnrichedContextInfo() });
        });
      } catch (lockErr) {
        await m.reply.warn(lockErr.message);
      }
    });
  },
};
