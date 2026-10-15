/**
 * @file src/lib/achievements.js
 * Achievement definitions + pure evaluation helpers.
 *
 * Plugins OWN their stat counters (they bump user.stats.* after each action)
 * and call `newlyUnlocked(user)` BEFORE persisting the latest stats, then
 * save the union into `user.achievements`. Kept pure (no db import) so the
 * logic can be unit-tested headlessly.
 *
 * Criteria only reference fields that actually exist on the user record:
 * coins / xp / level / streak (existing economy fields) and the
 * user.stats.* counters maintained by the hustle, casino and social plugins.
 */

export const ACHIEVEMENTS = [
  // ── Wealth ──────────────────────────────────────────────────────────────
  { id: 'first_doubloon', emoji: '🪙', name: 'First Doubloon',  desc: 'Hold your first coin',            tier: 'bronze', check: u => (u.coins ?? 0) >= 1 },
  { id: 'coin_collector', emoji: '💰', name: 'Coin Collector',  desc: 'Hold 5,000 coins at once',       tier: 'silver', check: u => (u.coins ?? 0) >= 5000 },
  { id: 'nexora_tycoon', emoji: '👑', name: 'Nexora Tycoon',    desc: 'Hold 100,000 coins at once',     tier: 'gold',   check: u => (u.coins ?? 0) >= 100000 },

  // ── Leveling ─────────────────────────────────────────────────────────────
  { id: 'rising_star',   emoji: '⭐', name: 'Rising Star',     desc: 'Reach level 5',                  tier: 'bronze', check: u => (u.level ?? 0) >= 5 },
  { id: 'veteran',       emoji: '🎖️', name: 'Veteran',          desc: 'Reach level 20',                tier: 'silver', check: u => (u.level ?? 0) >= 20 },
  { id: 'legend',        emoji: '🏆', name: 'Legend',           desc: 'Reach level 50',                 tier: 'gold',   check: u => (u.level ?? 0) >= 50 },

  // ── Streaks ──────────────────────────────────────────────────────────────
  { id: 'week_warrior',  emoji: '🔥', name: 'Week Warrior',     desc: 'Keep a 7-day daily streak',      tier: 'bronze', check: u => (u.streak ?? 0) >= 7 },
  { id: 'unbreakable',   emoji: '💎', name: 'Unbreakable',      desc: 'Keep a 30-day daily streak',     tier: 'gold',   check: u => (u.streak ?? 0) >= 30 },

  // ── Casino ───────────────────────────────────────────────────────────────
  { id: 'reel_rookie',   emoji: '🎰', name: 'Reel Rookie',      desc: 'Win your first .slots spin',     tier: 'bronze', check: u => s(u).slotsWins >= 1 },
  { id: 'lucky_sevens',  emoji: '7️⃣', name: 'Lucky Sevens',    desc: 'Hit the 7-7-7 slots jackpot',     tier: 'gold',   check: u => s(u).slotsJackpot >= 1 },
  { id: 'card_shark',    emoji: '🃏', name: 'Card Shark',       desc: 'Win 5 blackjack hands',          tier: 'silver', check: u => s(u).bjWins >= 5 },

  // ── Hustle ───────────────────────────────────────────────────────────────
  { id: 'pickpocket',    emoji: '🥷', name: 'Pickpocket',       desc: 'Pull off your first .rob',       tier: 'bronze', check: u => s(u).robWins >= 1 },
  { id: 'master_thief',  emoji: '🎭', name: 'Master Thief',     desc: 'Pull off 10 successful .rob runs', tier: 'silver', check: u => s(u).robWins >= 10 },
  { id: 'hustler',       emoji: '🕶️', name: 'Hustler',          desc: 'Complete 10 successful .crime runs', tier: 'silver', check: u => s(u).crimeWins >= 10 },
  { id: 'heist_captain', emoji: '🏦', name: 'Heist Captain',    desc: 'Walk away from 3 successful .heist jobs', tier: 'gold', check: u => s(u).heistWins >= 3 },

  // ── Wheel ─────────────────────────────────────────────────────────────────
  { id: 'wheel_regular', emoji: '🎡', name: 'Wheel Regular',   desc: 'Spin the wheel 7 times',        tier: 'bronze', check: u => s(u).spins >= 7 },

  // ── Social ───────────────────────────────────────────────────────────────
  { id: 'brave_heart',   emoji: '💌', name: 'Brave Heart',      desc: 'Send 10 anonymous confessions',  tier: 'silver', check: u => s(u).confesses >= 10 },
];

/** Never let one bad record kill the whole unlock scan. */
function safeCheck(def, user) {
  try { return def.check(user) === true; } catch { return false; }
}

const s = (u) => u?.stats ?? {};
const byId = new Map(ACHIEVEMENTS.map(a => [a.id, a]));

export const achievementById = (id) => byId.get(id);

const TIER_ORDER = { bronze: 0, silver: 1, gold: 2 };

/**
 * Which achievements are newly satisfied by this user record
 * (i.e. pass `check` but are not yet in user.achievements).
 * Returns the definitions, richest tier last for a nice reveal order.
 */
export function newlyUnlocked(user) {
  const have = new Set(user?.achievements ?? []);
  return ACHIEVEMENTS
    .filter(a => !have.has(a.id) && safeCheck(a, user))
    .sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);
}

/**
 * Human-readable unlock line for replies, e.g. "🏆 *ACHIEVEMENT UNLOCKED!* 🥷 Master Thief"
 */
export function unlockLine(def) {
  return `🏆 *ACHIEVEMENT UNLOCKED!* ${def.emoji} *${def.name}*`;
}

/**
 * Unlock a batch and return the updated achievements array + fresh defs.
 * Pure: returns data; caller persists with db.setUser.
 */
export function grantAchievements(user, defs) {
  const have = new Set(user?.achievements ?? []);
  for (const d of defs) have.add(d.id);
  return [...have];
}

/**
 * Progress snapshot for the .achievements gallery:
 * every def + unlocked flag, grouped tier.
 */
export function achievementGallery(user) {
  const have = new Set(user?.achievements ?? []);
  return {
    unlockedCount: have.size,
    total: ACHIEVEMENTS.length,
    tiers: ['bronze', 'silver', 'gold'].map(tier => ({
      tier,
      items: ACHIEVEMENTS.filter(a => a.tier === tier).map(a => ({
        ...a,
        unlocked: have.has(a.id),
      })),
    })),
  };
}
