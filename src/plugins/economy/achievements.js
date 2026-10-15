/**
 * @file src/plugins/economy/achievements.js
 * .achievements — the badge gallery. Unlocked count, per-tier rows,
 * locked badges shown greyed with the goal that unlocks them.
 */

import { db } from '../../database/db.js';
import { achievementGallery, ACHIEVEMENTS } from '../../lib/achievements.js';
import { withReactionStatus } from '../../lib/cosmetics.js';
import { richTableCard } from '../../lib/interactiveKit.js';

const TIER_LABEL = { bronze: '🥉 Bronze', silver: '🥈 Silver', gold: '🥇 Gold' };

export default {
  name: 'achievements',
  aliases: ['badges', 'trophies'],
  category: 'economy',
  description: 'Your achievement gallery — badges unlock as you climb, rob, spin and confess.',
  cooldown: 5000,
  execute: async ({ m, sock, prefix }) => {
    const p = prefix || '.';
    await withReactionStatus(m, async () => {
      try {
        const u = db.getUser(m.sender);
        const gallery = achievementGallery(u);

        const rows = [];
        for (const tier of gallery.tiers) {
          rows.push([TIER_LABEL[tier.tier], '']);
          for (const a of tier.items) {
            rows.push([
              a.unlocked ? `${a.emoji} ${a.name}` : `🔒 ${a.name}`,
              a.unlocked ? '✅ Unlocked' : a.desc,
            ]);
          }
        }

        try {
          await richTableCard(sock, m.from, {
            title: `🏆 ACHIEVEMENTS — ${gallery.unlockedCount}/${gallery.total}`,
            headers: ['Badge', 'Status'],
            rows,
            footer: `Badges unlock automatically. ${p}achievements to check your wall.`,
            buttons: [
              { label: 'My rank', cmd: `${p}rank` },
              { label: 'Profile', cmd: `${p}profile` },
            ],
          }, { quoted: m });
        } catch (_) {
          const flat = ACHIEVEMENTS
            .map(a => `${u.achievements?.includes(a.id) ? a.emoji : '🔒'} ${a.name} — ${u.achievements?.includes(a.id) ? '✅' : a.desc}`)
            .join('\n');
          await m.reply(`🏆 *Achievements (${gallery.unlockedCount}/${gallery.total})*\n\n${flat}`);
        }
      } catch (e) {
        await m.reply.error(`Achievements error: ${e.message}`);
      }
    });
  },
};
