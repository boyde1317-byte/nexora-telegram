/**
 * balance.js — Quick coin & XP check.
 *
 * Lightweight alternative to .profile when you just want the numbers.
 * Profile has full detail + card; balance is the 2-second glance.
 */
import { withReactionStatus } from '../../lib/cosmetics.js';
import { asciiBuilder } from '../../ui/asciiBuilder.js';
import { getLevelProgress, progressBar, rankBadge } from '../../economy/leveling.js';
import { buildEnrichedContextInfo } from '../../lib/enrichContext.js';

export default {
  name: 'balance',
  aliases: ['bal', 'wallet', 'coins'],
  category: 'economy',
  description: 'Quick check of your coin balance, XP, and level.',
  cooldown: 3000,
  execute: async ({ m, sock, db, prefix }) => {
    await withReactionStatus(m, async () => {
      const targetJid = m.quoted?.sender || m.sender;
      const isSelf = targetJid === m.sender;

      const userData = db.getUser(targetJid);
      const progress = getLevelProgress(userData.xp ?? 0);
      const bar = progressBar(progress.xpIntoLevel, progress.nextLevelXp - progress.currentLevelXp);
      const badge = rankBadge(progress.level);

      const lines = [
        `🪙 Coins    : ${(userData.coins ?? 0).toLocaleString()}`,
        `✨ XP       : ${(userData.xp ?? 0).toLocaleString()}`,
        `🏅 Level    : ${progress.level} (${badge})`,
        `📊 Progress : ${bar}`,
        `   Next     : ${progress.xpToNextLevel.toLocaleString()} XP to go`,
        ...(userData.streak ? [`${userData.streak >= 7 ? '🔥' : '✨'} Streak    : ${userData.streak} day${userData.streak !== 1 ? 's' : ''}`] : []),
      ];

      const title = isSelf ? 'YOUR BALANCE' : `BALANCE — +${targetJid.split('@')[0].slice(-6)}`;
      const text = asciiBuilder.box(title, lines);

      // Single message reply — removed follow-up action card to prevent double messages.
      await m.reply(text, { contextInfo: buildEnrichedContextInfo() });
    });
  }
};
