/**
 * @file src/economy/gacha.js
 * NEXORA Gacha — the pull machine. 300 coins per pull, five rarity tiers,
 * and a *pity system*: every 20th pull guarantees Rare or better. Pity
 * counts persist on the user record, so the guarantee survives restarts.
 *
 * Rarity odds (before pity): Common 58%, Uncommon 25%, Rare 10%,
 * Epic 5.5%, Legendary 1.5%.
 */

import { db } from '../database/db.js';
import { grantXp, withUserLock } from './leveling.js';

export const PULL_COST = 300;
export const PITY_THRESHOLD = 20;

export const POOL = [
  { tier: 'Common',    color: '#94a3b8', weight: 58,  rewards: [
    { kind: 'coins', amount: 60,   msg: 'Pocket change rains from the machine — *{n} coins* back.' },
    { kind: 'coins', amount: 100,  msg: 'A modest clatter. *{n} coins* tumble out.' },
    { kind: 'xp',     amount: 40,   msg: 'A warm glow of experience — *{n} XP*.' },
  ]},
  { tier: 'Uncommon',  color: '#34d399', weight: 25,  rewards: [
    { kind: 'coins', amount: 250,  msg: 'The machine shudders and pays out *{n} coins*!' },
    { kind: 'xp',     amount: 120, msg: 'Neon light floods the slot — *{n} XP* surges in!' },
    { kind: 'gems',   amount: 1,   msg: 'A single raw *gem* drops with a satisfying clink.' },
  ]},
  { tier: 'Rare',     color: '#38bdf8', weight: 10,  rewards: [
    { kind: 'coins', amount: 700,  msg: 'Three rows align — *{n} coins* cascade into the tray!' },
    { kind: 'gems',   amount: 2,   msg: 'Twin *gems* roll out, humming faintly.' },
    { kind: 'xp',     amount: 350, msg: 'Rare surge — *{n} XP* floods your veins.' },
  ]},
  { tier: 'Epic',     color: '#a855f7', weight: 5.5, rewards: [
    { kind: 'coins', amount: 1600, msg: 'EPIC PULL — the machine nearly jumps off the floor. *{n} coins*!' },
    { kind: 'gems',   amount: 4,   msg: 'EPIC — four *gems*, arranged like a little crown.' },
  ]},
  { tier: 'Legendary',color: '#fbbf24', weight: 1.5, rewards: [
    { kind: 'coins', amount: 5000, msg: '👑 LEGENDARY — golden light floods the room. *{n} coins*!' },
    { kind: 'gems',   amount: 10,  msg: '👑 LEGENDARY — a cascade of ten *gems* pours out!' },
  ]},
];

export const TIER_EMOJI = {
  Common: '⚪', Uncommon: '🟢', Rare: '🔵', Epic: '🟣', Legendary: '👑',
};

export function pullTier() {
  const total = POOL.reduce((s, t) => s + t.weight, 0);
  let roll = Math.random() * total;
  for (const t of POOL) {
    roll -= t.weight;
    if (roll <= 0) return t;
  }
  return POOL[0];
}

/**
 * One gacha pull, atomically. Pity: at PITY_THRESHOLD pulls without a
 * Rare+ result, the next pull is forced to Rare or better.
 * Returns { tier, reward, pityCounter, pityAt } or throws a friendly error.
 */
export async function gachaPull(jid) {
  return withUserLock(jid, async () => {
    const user = db.getUser(jid);
    const coins = user.coins ?? 0;
    if (coins < PULL_COST) {
      const err = new Error(`A pull costs ${PULL_COST} 🪙 — you have ${coins.toLocaleString()}. Top up with \`.daily\`, \`.sell all\` or a duel.`);
      err.friendly = true;
      throw err;
    }

    const pity = user.gachaPity ?? 0;
    let tier = pullTier();
    let usedPity = false;

    if (pity + 1 >= PITY_THRESHOLD && ['Common', 'Uncommon'].includes(tier.tier)) {
      // Pity honors the guarantee: force Rare or better.
      const guaranteed = POOL.filter(t => !['Common', 'Uncommon'].includes(t.tier));
      const gTotal = guaranteed.reduce((s, t) => s + t.weight, 0);
      let roll = Math.random() * gTotal;
      tier = guaranteed[guaranteed.length - 1];
      for (const t of guaranteed) {
        roll -= t.weight;
        if (roll <= 0) { tier = t; break; }
      }
      usedPity = true;
    }

    const reward = tier.rewards[Math.floor(Math.random() * tier.rewards.length)];
    const updates = { coins: coins - PULL_COST };

    if (reward.kind === 'coins') updates.coins = (coins - PULL_COST) + reward.amount;
    db.setUser(jid, updates);

    if (reward.kind === 'coins') {
      // net gain messaging handled by plugin using reward.amount - cost
    } else if (reward.kind === 'xp') {
      grantXp(db, jid, { xp: reward.amount });
    } else if (reward.kind === 'gems') {
      const rpg = user.rpg ?? { lastHunt: 0, lastMine: 0, lastFish: 0, inventory: {} };
      rpg.inventory = { ...(rpg.inventory ?? {}) };
      rpg.inventory.gem = (rpg.inventory.gem ?? 0) + reward.amount;
      db.setUser(jid, { rpg });
    }

    // Pity only resets on Rare or better.
    const nextPity = ['Common', 'Uncommon'].includes(tier.tier) ? pity + 1 : 0;
    db.setUser(jid, { gachaPity: nextPity });

    return {
      tier: tier.tier,
      tierColor: tier.color,
      reward,
      usedPity,
      pityCounter: nextPity,
      pityAt: PITY_THRESHOLD,
    };
  });
}

export default { gachaPull, PULL_COST, PITY_THRESHOLD, TIER_EMOJI };
