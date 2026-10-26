/**
 * @file src/economy/spending.js
 * The coin SINK — what coins are for. Commands outside the free set cost
 * coins to run; levels earn a rank discount on those costs, so XP grinding
 * pays off too. Charging happens in handlers/message.js right before
 * plugin execution; a plugin that throws gets its coins refunded, so
 * nobody ever pays for a failure.
 *
 * Free by design (cost 0):
 *   - economy   — the earning commands themselves (daily, crime, games with
 *                 their own stakes like slots/blackjack/duel)
 *   - rpg       — carries its own internal economy
 *   - owner     — admin tools
 *   - group / utility / channel — core chat tooling everyone needs
 *
 * Kill switch: set NEXORA_COIN_COSTS=off in the environment to make every
 * command free again without touching the table below.
 */

import { rankInfo } from './leveling.js';

/** Category base costs. Absent category = free. */
const CATEGORY_COSTS = {
  ai: 25,          // inference calls
  logomaker: 30,   // heavy image generation
  media: 15,       // premium card/generator effects
  anime: 10,
  fun: 10,
  web: 10,
  download: 5,
  games: 5,
};

/** Per-command overrides win over the category base. */
const COMMAND_COSTS = {
  fakeprofile: 20,
};

/** Rank-based discount on costs — the reason levels are worth grinding. */
const RANK_DISCOUNTS = {
  Bronze: 0.00,
  Silver: 0.05,
  Gold: 0.10,
  Platinum: 0.15,
  Diamond: 0.20,
  Legend: 0.25,
};

export function coinCostsEnabled() {
  return process.env.NEXORA_COIN_COSTS !== 'off';
}

/**
 * Effective cost for a command for a given user (0 = free).
 * Plugin-level `cost: n` field wins over both tables — lets a plugin
 * opt into a custom price (or `cost: 0` to opt out) without touching
 * this file.
 */
export function commandCost(command, user) {
  if (!coinCostsEnabled() || !command) return 0;
  const base = command.cost !== undefined
    ? command.cost
    : (COMMAND_COSTS[command.name] ?? CATEGORY_COSTS[command.category] ?? 0);
  if (!base || base <= 0) return 0;

  const { label } = rankInfo(user?.level ?? 0);
  const discount = RANK_DISCOUNTS[label] ?? 0;
  return Math.max(1, Math.round(base * (1 - discount)));
}

/**
 * Atomically deduct coins. Returns { ok, balance, cost } — ok=false when
 * the balance is too low (never leaves a negative balance).
 */
export function chargeCoins(db, jid, cost) {
  const user = db.getUser(jid);
  const balance = user.coins ?? 0;
  if (balance < cost) {
    return { ok: false, balance, cost };
  }
  db.setUser(jid, { coins: balance - cost });
  return { ok: true, balance: balance - cost, cost };
}

/** Refund a prior charge (plugin threw after the fee was taken). */
export function refundCoins(db, jid, cost) {
  if (!cost) return;
  const user = db.getUser(jid);
  db.setUser(jid, { coins: (user.coins ?? 0) + cost });
}

/** The "how do I get coins" hint shared by the insufficient-funds error. */
export const EARN_HINT = 'Earn more with `.daily`, `.crime`, `.farm`, or try your luck at `.slots` — see `.balance`.';
