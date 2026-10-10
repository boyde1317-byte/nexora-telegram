/**
 * @file src/economy/rpg.js
 * NEXORA RPG core — hunting, mining and fishing that feed the shared
 * coin + XP economy (level-ups trigger the Card Engine announcement).
 *
 * Single source of truth for loot tables, cooldowns and inventory so the
 * three action plugins stay thin. All state lives on the user record under
 * `rpg: { lastHunt, lastMine, lastFish, inventory: {...} }`; every mutation
 * runs inside withUserLock so rapid-fire commands can't double-spend or
 * double-loot.
 */

import { db } from '../database/db.js';
import { grantXp, withUserLock } from './leveling.js';

const ACTION_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes
const COOLDOWN_LABEL = '15 minutes';

export const LOOT_TABLES = {
  hunt: [
    { key: 'meat',  qty: [1, 3], weight: 55, xp: 12, msg: ['🏹 You tracked a bushbuck through the tall grass — *{qty} fresh meat* secured!', '🐗 A wild boar charged… you sidestepped and took it down. *{qty} meat*!'] },
    { key: 'meat',  qty: [4, 6], weight: 18, xp: 25, msg: ['🎯 Clean headshot on an antelope herd leader. *{qty} meat*, no suffering.', '🐘 A strayed elephant calf? No. You found a fat buffalo instead — *{qty} meat*!'] },
    { key: 'gem',   qty: [1, 1], weight: 12, xp: 40, msg: ['✨ The beast you felled had swallowed a *gem*! Lucky day, hunter.', '💎 Deep in the bush you spotted a glint — a raw *gem* in the dirt!'] },
    { key: null,    qty: [0, 0], weight: 15, xp: 3,  msg: ['🍂 Twigs snapped, wind changed, everything fled. The bush is quiet today.', '🌫️ You circled for an hour and found only footprints. Try again later.'] },
  ],
  mine: [
    { key: 'ore',   qty: [1, 4], weight: 55, xp: 12, msg: ['⛏️ Your pickaxe rang true — *{qty} iron ore* chipped from the vein!', '🪨 Deep in the shaft you cracked a rich seam: *{qty} ore*.'] },
    { key: 'ore',   qty: [5, 8], weight: 18, xp: 25, msg: ['💥 The rock face split open like a piñata — *{qty} ore* tumbling out!', '🔥 Torchlight caught a motherlode. *{qty} ore* hauled to the surface.'] },
    { key: 'gem',   qty: [1, 2], weight: 12, xp: 40, msg: ['💎 Behind the quartz you felt a cold hardness… *{qty} raw gem*! The cave sang.', '✨ You nearly discarded it as rubble — good thing you looked twice. *{qty} gem*!'] },
    { key: null,    qty: [0, 0], weight: 15, xp: 3,  msg: ['⛏️ Two hours of swinging, a pile of worthless gravel.', '🕳️ The shaft caved in behind you. Shaken, empty-handed, alive. Could be worse.'] },
  ],
  fish: [
    { key: 'fish',  qty: [1, 3], weight: 55, xp: 12, msg: ['🎣 The line went taut and you hauled in *{qty} tilapia*!', '🌊 Cast, splash, fight — *{qty} fish* in the bucket.'] },
    { key: 'fish',  qty: [4, 7], weight: 18, xp: 25, msg: ['🐟 The net came up HEAVY. *{qty} fish* — the whole market will smell it.', '⚓ A monster catfish nearly took the rod. You won. *{qty} fish*!'] },
    { key: 'gem',   qty: [1, 1], weight: 12, xp: 40, msg: ['💎 You reeled up an old bottle… something rattles inside. A *gem*!', '✨ A fish with a golden glint in its belly? You cut it open — *1 gem*!'] },
    { key: null,    qty: [0, 0], weight: 15, xp: 3,  msg: ['🎣 The fish stared at your hook and swam away. Rude.', '🌊 Four hours, two bites, zero catches. The lake won today.'] },
  ],
};

/** Base sale prices per resource (coins). */
export const RESOURCE_PRICES = {
  meat: 40,
  fish: 35,
  ore:  45,
  gem:  400,
};

export const RESOURCE_EMOJI = {
  meat: '🥩', fish: '🐟', ore: '🪨', gem: '💎',
};

function pickWeighted(table) {
  const total = table.reduce((s, e) => s + e.weight, 0);
  let roll = Math.random() * total;
  for (const entry of table) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }
  return table[table.length - 1];
}

function msLeftLabel(ms) {
  const min = Math.max(1, Math.ceil(ms / 60000));
  return min >= 60 ? `${Math.ceil(min / 60)} hour(s)` : `${min} minute(s)`;
}

function getRpg(jid) {
  const user = db.getUser(jid);
  if (!user.rpg || typeof user.rpg !== 'object') {
    db.setUser(jid, { rpg: { lastHunt: 0, lastMine: 0, lastFish: 0, inventory: {} } });
  }
  return db.getUser(jid).rpg;
}

/**
 * Run one RPG action (hunt/mine/fish) with cooldown + lock + loot grant.
 * Returns { message, xpGained, cooldownMs } or throws a user-friendly
 * cooldown error the plugin can reply.warn with.
 */
export async function runRpgAction(jid, action) {
  const table = LOOT_TABLES[action];
  if (!table) throw new Error(`Unknown action: ${action}`);

  return withUserLock(jid, async () => {
    const rpg = getRpg(jid);
    const lastAt = rpg[`last${action[0].toUpperCase()}${action.slice(1)}`] ?? 0;
    const elapsed = Date.now() - lastAt;
    if (elapsed < ACTION_COOLDOWN_MS) {
      const err = new Error(`Your ${action} gear is still cooling down — try again in *${msLeftLabel(ACTION_COOLDOWN_MS - elapsed)}*.`);
      err.cooldown = true;
      throw err;
    }

    const entry = pickWeighted(table);
    const qty = entry.key ? Math.floor(Math.random() * (entry.qty[1] - entry.qty[0] + 1)) + entry.qty[0] : 0;

    const inventory = { ...(rpg.inventory ?? {}) };
    if (entry.key) inventory[entry.key] = (inventory[entry.key] ?? 0) + qty;

    db.setUser(jid, {
      rpg: {
        ...rpg,
        [`last${action[0].toUpperCase()}${action.slice(1)}`]: Date.now(),
        inventory,
      },
    });

    if (entry.xp > 0) grantXp(db, jid, { xp: entry.xp });

    const template = entry.msg[Math.floor(Math.random() * entry.msg.length)];
    return {
      message: template.replace('{qty}', String(qty)),
      item: entry.key,
      qty,
      xpGained: entry.xp,
    };
  });
}

/**
 * Sell resources for coins. `keys` is a list from the inventory; 'all' sells
 * everything. Returns { lines, coinsEarned } or throws a friendly error.
 */
export async function sellResources(jid, keys) {
  return withUserLock(jid, async () => {
    const rpg = getRpg(jid);
    const inventory = { ...(rpg.inventory ?? {}) };
    const sellKeys = keys.includes('all')
      ? Object.keys(inventory).filter(k => (inventory[k] ?? 0) > 0)
      : [...new Set(keys)].filter(k => (inventory[k] ?? 0) > 0);

    if (sellKeys.length === 0) {
      const err = new Error(keys.includes('all')
        ? 'Your bag is empty — go hunt, mine or fish something first!'
        : `Nothing to sell. You hold no such resource, or the bag is empty. Check \`.inv\`.`);
      err.friendly = true;
      throw err;
    }

    let coinsEarned = 0;
    const lines = [];
    for (const k of sellKeys) {
      const have = inventory[k] ?? 0;
      const unit = RESOURCE_PRICES[k] ?? 0;
      const earned = have * unit;
      inventory[k] = 0;
      coinsEarned += earned;
      lines.push(`${RESOURCE_EMOJI[k] ?? '📦'} *${have} ${k}* → ${earned.toLocaleString()} 🪙`);
    }

    db.setUser(jid, { rpg: { ...rpg, inventory } });
    grantXp(db, jid, { coins: coinsEarned });

    return { lines, coinsEarned };
  });
}

export function getInventory(jid) {
  const inv = getRpg(jid).inventory ?? {};
  const entries = Object.entries(inv).filter(([, v]) => (v ?? 0) > 0);
  return { entries, isEmpty: entries.length === 0 };
}

export function cooldownInfo(jid) {
  const rpg = getRpg(jid);
  const now = Date.now();
  const fmt = (t) => {
    const left = ACTION_COOLDOWN_MS - (now - t);
    return left <= 0 ? 'ready' : msLeftLabel(left);
  };
  return {
    hunt: fmt(rpg.lastHunt ?? 0),
    mine: fmt(rpg.lastMine ?? 0),
    fish: fmt(rpg.lastFish ?? 0),
  };
}

export const RPG_COOLDOWN_LABEL = COOLDOWN_LABEL;
export default { runRpgAction, sellResources, getInventory, cooldownInfo, RESOURCE_PRICES, RESOURCE_EMOJI };
