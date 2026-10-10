/**
 * @file src/plugins/economy/rank.js
 * .rank — renders the user's XP rank card as a shareable image.
 *
 * Uses the NEXORA Card Engine (src/lib/cardEngine.js) so every card in the
 * bot shares one brand language. XP data comes from the same leveling.js
 * snapshot the leaderboard uses — no second xp source.
 */

import { db } from '../../database/db.js';
import { getLevelProgress, rankBadge } from '../../economy/leveling.js';
import { renderRankCard } from '../../lib/cardEngine.js';
import { getDisplayName } from '../../lib/displayName.js';
import { withReactionStatus } from '../../lib/cosmetics.js';

export default {
  name: 'rank',
  aliases: ['rankcard', 'level'],
  category: 'economy',
  description: 'Shows your XP rank card. Usage: .rank [mention/reply] — or plain .rank for yourself',
  cooldown: 5000,
  execute: async ({ m, sock, prefix }) => {
    const p = prefix || '.';
    await withReactionStatus(m, async () => {
      try {
        const who = m.mentionedJid?.[0] || m.quoted?.sender || m.sender;
        const user = db.getUser(who);
        const progress = getLevelProgress(user.xp ?? 0);

        // Overall position: rank by xp among every user record in the db
        const all = Object.values(db.data?.users ?? {});
        const position = [...all]
          .sort((a, b) => (b.xp ?? 0) - (a.xp ?? 0))
          .findIndex(u => u.jid === who);

        const [name, avatarUrl] = await Promise.all([
          getDisplayName(sock, who),
          sock.profilePictureUrl(who, 'image').catch(() => null),
        ]);

        const card = await renderRankCard({
          name,
          avatarUrl,
          level: progress.level,
          xp: progress.xp,
          xpIntoLevel: progress.xpIntoLevel,
          xpToNextLevel: progress.xpToNextLevel,
          levelSpan: progress.nextLevelXp - progress.currentLevelXp,
          rankBadge: rankBadge(progress.level),
          coins: user.coins ?? 0,
          streak: user.streak ?? 0,
          position: position >= 0 ? position + 1 : null,
        });

        await sock.sendMessage(m.from, {
          image: card,
          caption:
            `⚡ *${name}* — Level ${progress.level}\n` +
            `Rank: ${rankBadge(progress.level)}${position >= 0 ? ` • #${position + 1} overall` : ''}\n` +
            `${progress.xpToNextLevel} XP to next level\n_Keep chatting to level up_`,
        }, { quoted: m });
      } catch (err) {
        await m.reply.error(`Could not render the rank card: ${err.message}`);
        throw err;
      }
    });
  },
};
