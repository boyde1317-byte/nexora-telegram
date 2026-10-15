/**
 * @file src/plugins/economy/quests.js
 * .quests — this week's 3 rotating objectives with progress bars and
 * claimable rewards. Progress is bumped by the hustle/casino plugins
 * themselves; claiming is manual (the dopamine button).
 */

import { db } from '../../database/db.js';
import { withUserLock } from '../../economy/leveling.js';
import { commitAction } from '../../economy/actions.js';
import { weeklyQuests, questState, questProgress, currentWeek, QUEST_REWARD_XP } from '../../economy/quests.js';
import { withReactionStatus } from '../../lib/cosmetics.js';
import { richTableCard } from '../../lib/interactiveKit.js';
import { progressBar } from '../../economy/leveling.js';

export default {
  name: 'quests',
  aliases: ['quest', 'weekly', 'challenges'],
  category: 'economy',
  description: 'Weekly quests with coin rewards. New set every Monday. Progress auto-tracks from your hustle.',
  cooldown: 5000,
  execute: async ({ m, sock, prefix }) => {
    const p = prefix || '.';
    await withReactionStatus(m, async () => {
      try {
        await withUserLock(m.sender, async () => {
          const u = db.getUser(m.sender);
          const state = questState(u);
          const claimIdx = Number(m.args?.[0]);
          const isClaim = Number.isInteger(claimIdx) && claimIdx >= 1 && claimIdx <= 3;
          const quests = weeklyQuests();

          if (isClaim) {
            const q = quests[claimIdx - 1];
            const prog = questProgress(state, q);
            if (state.claimed.includes(q.id)) {
              return await m.reply.warn(`Already claimed *${q.emoji} ${q.desc}* this week.`, 'QUESTS');
            }
            if (!prog.complete) {
              return await m.reply.warn(`Not done yet: *${q.emoji} ${q.desc}* — ${prog.done}/${prog.goal}.`, 'QUESTS');
            }
            state.claimed.push(q.id);
            const { result, lines } = commitAction(m.sender, {
              coinsDelta: q.reward,
              xp: QUEST_REWARD_XP,
              extra: { quests: state },
            });
            try {
              await richTableCard(sock, m.from, {
                title: '📋 QUEST COMPLETE!',
                headers: ['', ''],
                rows: [
                  ['Quest', `${q.emoji} ${q.desc}`],
                  ['Reward', `🪙 +${q.reward.toLocaleString()} • ✨ +${QUEST_REWARD_XP} XP`],
                  ['Balance', `🪙 ${(result.after.coins ?? 0).toLocaleString()}`],
                ],
                footer: lines.length ? lines.join('\n') : 'Fresh quests drop every Monday.',
                buttons: [
                  { label: 'View quests', cmd: `${p}quests` },
                  { label: 'Wheel', cmd: `${p}spin` },
                ],
              }, { quoted: m });
            } catch (_) {
              await m.reply(`📋 Quest complete! ${q.emoji} ${q.desc} — 🪙 +${q.reward}${lines.length ? '\n' + lines.join('\n') : ''}`);
            }
            return;
          }

          // persist lazy reset so progress tracking starts fresh for the week
          if (u.quests !== state) db.setUser(m.sender, { quests: state });

          const rows = quests.map((q, i) => {
            const prog = questProgress(state, q);
            const claimed = state.claimed.includes(q.id);
            const status = claimed ? '✅ Claimed' : prog.complete ? `🎁 Ready — ${p}quests ${i + 1} to claim` : progressBar(prog.done, prog.goal);
            return [`${q.emoji} ${q.desc}`, `${status}  (🪙 ${q.reward})`];
          });

          try {
            await richTableCard(sock, m.from, {
              title: `📋 WEEKLY QUESTS — Week ${currentWeek()}`,
              headers: ['Quest', 'Progress'],
              rows,
              footer: 'Progress tracks automatically. Claim with .quests <1-3>',
              buttons: [
                { label: 'Claim 1', cmd: `${p}quests 1` },
                { label: 'Claim 2', cmd: `${p}quests 2` },
                { label: 'Claim 3', cmd: `${p}quests 3` },
              ],
            }, { quoted: m });
          } catch (_) {
            await m.reply(quests.map((q, i) => {
              const prog = questProgress(state, q);
              return `${i + 1}. ${q.emoji} ${q.desc} — ${prog.done}/${prog.goal} (🪙 ${q.reward})`;
            }).join('\n'));
          }
        });
      } catch (e) {
        if (String(e?.message).includes('transaction')) return await m.reply.warn(String(e.message), 'QUESTS');
        await m.reply.error(`Quests error: ${e.message}`);
      }
    });
  },
};
