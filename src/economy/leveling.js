/**
 * @file src/economy/leveling.js
 * Single source of truth for the XP / leveling system.
 *
 * Every plugin or handler that reads or mutates xp/level/coins must go
 * through here instead of re-deriving the level formula locally — profile.js,
 * daily.js, leaderboard.js and the message handler all previously carried
 * their own copies of xpToLevel/levelToXp/progressBar/rankBadge, which is
 * exactly the kind of drift that causes a leaderboard to disagree with a
 * profile card. Add new leveling behaviour here, not in a plugin.
 */

import { config } from '../../config/index.js';

/**
 * Level curve: xp required for level N is N^2 * 100 (level 0 = 0xp,
 * level 1 = 100xp, level 2 = 400xp, level 3 = 900xp, ...).
 */
export function xpToLevel(xp) {
  return Math.floor(Math.sqrt(Math.max(0, xp ?? 0) / 100));
}

export function xpForLevel(level) {
  return Math.max(0, level) ** 2 * 100;
}

/**
 * Full progress snapshot for a given xp total — level, the xp thresholds
 * bracketing it, and how far into the current level the user is.
 */
export function getLevelProgress(xp) {
  const total = Math.max(0, xp ?? 0);
  const level = xpToLevel(total);
  const currentLevelXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  const span = nextLevelXp - currentLevelXp;
  const into = total - currentLevelXp;
  return {
    level,
    xp: total,
    currentLevelXp,
    nextLevelXp,
    xpIntoLevel: into,
    xpToNextLevel: Math.max(0, nextLevelXp - total),
    progressRatio: span > 0 ? Math.min(into / span, 1) : 1,
  };
}

export function progressBar(current, max, length = 12) {
  const pct = max > 0 ? Math.min(Math.max(current, 0) / max, 1) : 1;
  const filled = Math.round(pct * length);
  return '█'.repeat(filled) + '░'.repeat(length - filled) + ` ${Math.round(pct * 100)}%`;
}

const RANKS = [
  { min: 50, badge: '👑', label: 'Legend' },
  { min: 30, badge: '💎', label: 'Diamond' },
  { min: 20, badge: '🏆', label: 'Platinum' },
  { min: 10, badge: '🥇', label: 'Gold' },
  { min: 5, badge: '🥈', label: 'Silver' },
  { min: 0, badge: '🥉', label: 'Bronze' },
];

export function rankInfo(level) {
  return RANKS.find(r => level >= r.min) ?? RANKS[RANKS.length - 1];
}

export function rankBadge(level) {
  const r = rankInfo(level);
  return `${r.badge} ${r.label}`;
}

export function streakEmoji(streak) {
  if (streak >= 30) return '🔥🔥🔥';
  if (streak >= 14) return '🔥🔥';
  if (streak >= 7) return '🔥';
  if (streak >= 3) return '✨';
  return '💤';
}

/**
 * Grant xp/coins to a user and persist the result in one call. Returns the
 * before/after level so callers can decide whether to announce a level-up
 * without re-deriving xpToLevel themselves.
 *
 * @param {object} db   The db singleton (getUser/setUser)
 * @param {string} jid
 * @param {object} amounts
 * @param {number} [amounts.xp=0]
 * @param {number} [amounts.coins=0]
 * @param {object} [extra] Additional fields to merge into the user record (e.g. lastDaily, streak)
 */
export function grantXp(db, jid, { xp = 0, coins = 0 } = {}, extra = {}) {
  const user = db.getUser(jid);
  const beforeXp = user.xp ?? 0;
  const beforeCoins = user.coins ?? 0;
  const beforeLevel = xpToLevel(beforeXp);

  const afterXp = beforeXp + Math.max(0, xp);
  const afterCoins = beforeCoins + Math.max(0, coins);
  const afterLevel = xpToLevel(afterXp);

  db.setUser(jid, {
    xp: afterXp,
    coins: afterCoins,
    level: afterLevel,
    ...extra,
  });

  return {
    before: { xp: beforeXp, coins: beforeCoins, level: beforeLevel },
    after: { xp: afterXp, coins: afterCoins, level: afterLevel },
    xpGained: Math.max(0, xp),
    coinsGained: Math.max(0, coins),
    leveledUp: afterLevel > beforeLevel,
    levelsGained: afterLevel - beforeLevel,
  };
}

/**
 * Per-chat, per-user cooldown gate for passive message xp. Keyed off the
 * same `client.cooldowns`-style Map pattern used for command cooldowns, but
 * kept in its own Map (`client.xpCooldowns`) so command spam-guards and xp
 * gain never interfere with each other.
 */
export function canGainMessageXp(client, sender, chatJid) {
  if (!client.xpCooldowns) client.xpCooldowns = new Map();
  const key = `${chatJid}_${sender}`;
  const now = Date.now();
  const last = client.xpCooldowns.get(key) ?? 0;
  if (now - last < config.xp.messageCooldownMs) return false;
  client.xpCooldowns.set(key, now);

  // Periodic cleanup: every ~5 minutes, evict expired entries to prevent
  // unbounded growth in long-running processes with many users.
  if (!client._xpCleanupAt || now > client._xpCleanupAt) {
    client._xpCleanupAt = now + 300000; // 5 min
    const expiry = now - config.xp.messageCooldownMs;
    for (const [k, ts] of client.xpCooldowns) {
      if (ts < expiry) client.xpCooldowns.delete(k);
    }
  }

  return true;
}

export function randomMessageXp() {
  const { perMessageMin, perMessageMax } = config.xp;
  return Math.floor(Math.random() * (perMessageMax - perMessageMin + 1)) + perMessageMin;
}



// ── Per-user lock for economy transactions ──────────────────────────────
// Prevents race conditions in daily claims and shop purchases where two
// rapid commands could read the same balance before either writes.
const _userLocks = new Set();

export async function withUserLock(jid, fn) {
  if (_userLocks.has(jid)) {
    throw new Error('Another transaction is in progress. Please wait a moment.');
  }
  _userLocks.add(jid);
  try {
    return await fn();
  } finally {
    _userLocks.delete(jid);
  }
}

export default {
  xpToLevel,
  withUserLock,
  xpForLevel,
  getLevelProgress,
  progressBar,
  rankInfo,
  rankBadge,
  streakEmoji,
  grantXp,
  canGainMessageXp,
  randomMessageXp,
};
