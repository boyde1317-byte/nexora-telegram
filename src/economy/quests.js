/**
 * @file src/economy/quests.js
 * Weekly quest system — pure helpers, no db import.
 *
 * A user's weekly quest state lives at `user.quests`:
 *   { week: <isoWeekNumber>, p: { slotWins, bjWins, robWins, crimeWins, spins, heistWins }, claimed: [ids] }
 *
 * Quests rotate deterministically per ISO week (3 of a pool of 6), so every
 * player worldwide gets the same slate — that's the shared-experience hook.
 * The state resets lazily the first time a NEW week touches it.
 */

const QUEST_POOL = [
  { id: 'hot_reels',   emoji: '🎰', desc: 'Win 3 .slots spins',            field: 'slotWins',  goal: 3, reward: 500 },
  { id: 'card_house', emoji: '🃏', desc: 'Win 2 blackjack hands',          field: 'bjWins',    goal: 2, reward: 500 },
  { id: 'sticky',      emoji: '🥷', desc: 'Pull off 2 successful .rob runs', field: 'robWins',   goal: 2, reward: 600 },
  { id: 'grindset',   emoji: '🕶️', desc: 'Land 4 successful .crime runs',  field: 'crimeWins', goal: 4, reward: 600 },
  { id: 'spin_city',  emoji: '🎡', desc: 'Spin the wheel 5 times',        field: 'spins',     goal: 5, reward: 400 },
  { id: 'crew_up',    emoji: '🏦', desc: 'Succeed in 2 heists',           field: 'heistWins', goal: 2, reward: 800 },
];

/** ISO week number — the quest reset cadence. */
export function currentWeek(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const fDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fDayNum + 3);
  return 1 + Math.round((d - firstThursday) / (7 * 24 * 3600 * 1000));
}

/** The 3 quests active this week (deterministic rotation). */
export function weeklyQuests(week = currentWeek()) {
  const picks = [];
  for (let i = 0; i < 3; i++) picks.push(QUEST_POOL[(week * 3 + i) % QUEST_POOL.length]);
  return picks;
}

/**
 * Read (and lazily reset) the user's quest progress for THIS week.
 * Returns the state object; caller persists it via db.setUser.
 */
export function questState(user, week = currentWeek()) {
  const q = user?.quests;
  if (!q || q.week !== week || !q.p) {
    return { week, p: { slotWins: 0, bjWins: 0, robWins: 0, crimeWins: 0, spins: 0, heistWins: 0 }, claimed: [] };
  }
  return q;
}

/**
 * Progress-safe view of a quest for this user state.
 */
export function questProgress(state, quest) {
  const done = Math.min((state.p[quest.field] ?? 0), quest.goal);
  return { done, goal: quest.goal, complete: done >= quest.goal };
}

export const QUEST_REWARD_XP = 100;

export default { QUEST_POOL, currentWeek, weeklyQuests, questState, questProgress, QUEST_REWARD_XP };
