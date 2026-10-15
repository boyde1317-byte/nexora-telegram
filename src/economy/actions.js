/**
 * @file src/economy/actions.js
 * Shared commit helper for all economy actions — one write per action that
 * folds in stat counters, weekly quest progress, achievement unlocks and
 * coin/XP movement, so plugins never hand-roll this sequence.
 */

import { db } from '../database/db.js';
import { grantXp } from './leveling.js';
import { newlyUnlocked, grantAchievements, unlockLine } from '../lib/achievements.js';
import { questState } from './quests.js';

/**
 * Persist the outcome of one economy action.
 *
 * @param {string} jid
 * @param {object} opts
 * @param {number} [opts.coinsDelta]  net coin change (may be negative)
 * @param {number} [opts.xp]          XP gained (>= 0)
 * @param {object} [opts.stats]       stat counter updates, e.g. { robWins: prev+1 }
 * @param {string} [opts.quest]       weekly quest progress field to bump
 * @param {number} [opts.questN=1]    how much to bump it by
 * @param {object} [opts.extra]       any other user fields to merge
 * @returns {{ result: object, unlocks: Array, lines: string[] }}
 */
export function commitAction(jid, { coinsDelta = 0, xp = 0, stats = {}, quest = null, questN = 1, extra = {} } = {}) {
  const u = db.getUser(jid);
  const statsMerged = { ...(u.stats ?? {}), ...stats };
  const unlocks = newlyUnlocked({ ...u, stats: statsMerged });
  const achievements = grantAchievements(u, unlocks);

  let quests = u.quests;
  if (quest) {
    const st = questState(u);
    st.p[quest] = (st.p[quest] ?? 0) + questN;
    quests = st;
  }

  const persist = { stats: statsMerged, achievements, quests, ...extra };

  if (coinsDelta >= 0) {
    const result = grantXp(db, jid, { xp, coins: coinsDelta }, persist);
    return { result, unlocks, lines: unlocks.map(unlockLine) };
  }

  // Net loss — grantXp can only add coins, so write the balance directly.
  const afterCoins = Math.max(0, (u.coins ?? 0) + coinsDelta);
  db.setUser(jid, { ...persist, coins: afterCoins });
  return {
    result: { after: { coins: afterCoins, xp: u.xp ?? 0, level: u.level ?? 0 }, leveledUp: false, coinsGained: coinsDelta },
    unlocks,
    lines: unlocks.map(unlockLine),
  };
}

export function unlockLines(unlocks) {
  return unlocks.map(unlockLine);
}

export default { commitAction, unlockLines };
