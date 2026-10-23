/**
 * farm.js — NEXORA Farm game engine (ported from OURIN DELUXE V3.4.1 garden).
 *
 * Mechanics, crop catalog and growth timings follow OURIN's garden/berladang
 * commands, rebalanced for the NEXORA economy (coins/xp via grantXp):
 *   .farm buy <crop> [qty]  → spend coins on seeds
 *   .farm plant <crop>      → plant a seed in a free plot
 *   .farm harvest           → collect everything that finished growing
 *   .farm sell [crop|all]   → sell harvested crops for coins
 *   .farm upgrade           → buy one more plot (max 9)
 *
 * State lives on the user record (user.farm) so growth survives restarts —
 * plantedAt timestamps are compared against Date.now() on every read.
 */
export const FARM_CROPS = {
  carrot:     { name: '🥕 Carrot',     growMs: 5 * 60_000,   xp: 50,  sellPrice: 30,  seedPrice: 10 },
  tomato:     { name: '🍅 Tomato',     growMs: 10 * 60_000,  xp: 80,  sellPrice: 50,  seedPrice: 20 },
  corn:       { name: '🌽 Corn',       growMs: 15 * 60_000,  xp: 120, sellPrice: 80,  seedPrice: 35 },
  herb:       { name: '🌿 Herbs',      growMs: 25 * 60_000,  xp: 180, sellPrice: 120, seedPrice: 50 },
  potato:     { name: '🥔 Potato',     growMs: 20 * 60_000,  xp: 150, sellPrice: 100, seedPrice: 45 },
  strawberry: { name: '🍓 Strawberry', growMs: 30 * 60_000,  xp: 200, sellPrice: 150, seedPrice: 60 },
  watermelon: { name: '🍉 Watermelon', growMs: 60 * 60_000,  xp: 350, sellPrice: 300, seedPrice: 100 },
  pumpkin:    { name: '🎃 Pumpkin',    growMs: 120 * 60_000, xp: 500, sellPrice: 500, seedPrice: 150 },
};

export const FARM_BASE_PLOTS = 3;
export const FARM_MAX_PLOTS = 9;
const UPGRADE_BASE_COST = 250;

/** Get (and lazily create) the farm state on a user record. */
export function getFarm(user) {
  if (!user.farm || typeof user.farm !== 'object') user.farm = { plots: [], seeds: {}, crops: {} };
  if (!Array.isArray(user.farm.plots)) user.farm.plots = [];
  if (!user.farm.seeds || typeof user.farm.seeds !== 'object') user.farm.seeds = {};
  if (!user.farm.crops || typeof user.farm.crops !== 'object') user.farm.crops = {};
  if (typeof user.farm.upgrades !== 'number') user.farm.upgrades = 0;
  return user.farm;
}

/** Total plot capacity: 3 base + purchased upgrades (max 9). */
export function plotCapacity(farm) {
  return Math.min(FARM_MAX_PLOTS, FARM_BASE_PLOTS + (farm.upgrades | 0));
}

/** Next plot upgrade cost — gets steeper with every plot owned. */
export function upgradeCost(farm) {
  return UPGRADE_BASE_COST * plotCapacity(farm);
}

/** Snapshot of every plot with its remaining growth time. */
export function plotStatus(farm, now = Date.now()) {
  return farm.plots.map((p, i) => {
    const crop = FARM_CROPS[p.crop];
    const remaining = Math.max(0, crop.growMs - (now - p.plantedAt));
    return { index: i, crop: p.crop, name: crop.name, plantedAt: p.plantedAt, remaining, ready: remaining <= 0 };
  });
}

/**
 * Plant a seed — consumes one seed and occupies a free plot.
 * Returns { ok, crop?, reason? }.
 */
export function plantSeed(farm, cropKey, now = Date.now()) {
  const crop = FARM_CROPS[cropKey];
  if (!crop) return { ok: false, reason: 'unknown-crop' };
  if ((farm.seeds[cropKey] || 0) < 1) return { ok: false, reason: 'no-seed' };
  if (farm.plots.length >= plotCapacity(farm)) return { ok: false, reason: 'plots-full' };
  farm.seeds[cropKey]--;
  if (farm.seeds[cropKey] <= 0) delete farm.seeds[cropKey];
  farm.plots.push({ crop: cropKey, plantedAt: now });
  return { ok: true, crop };
}

/**
 * Harvest every ready plot. Returns { harvested: [{crop, name, qty}], xp }.
 * Yield is 2-4 per plot (same spread as OURIN garden).
 */
export function harvestPlots(farm, now = Date.now()) {
  const keep = [];
  const harvested = [];
  let xp = 0;
  for (const plot of farm.plots) {
    const crop = FARM_CROPS[plot.crop];
    if (now - plot.plantedAt >= crop.growMs) {
      const qty = Math.floor(Math.random() * 3) + 2;
      farm.crops[plot.crop] = (farm.crops[plot.crop] || 0) + qty;
      xp += crop.xp;
      harvested.push({ crop: plot.crop, name: crop.name, qty });
    } else {
      keep.push(plot);
    }
  }
  farm.plots = keep;
  return { harvested, xp };
}

/**
 * Sell harvested crops. cropKey 'all' liquidates the whole silo.
 * Returns { ok, items: [{crop, name, qty, coins}], total }.
 */
export function sellCrops(farm, cropKey = 'all') {
  const keys = cropKey === 'all' ? Object.keys(farm.crops) : [cropKey];
  const items = [];
  let total = 0;
  for (const key of keys) {
    const qty = farm.crops[key] || 0;
    const crop = FARM_CROPS[key];
    if (!crop || qty < 1) continue;
    const coins = qty * crop.sellPrice;
    total += coins;
    delete farm.crops[key];
    items.push({ crop: key, name: crop.name, qty, coins });
  }
  return { ok: items.length > 0, items, total };
}

/** Humanize a millisecond duration: "1h 2m" / "3m 40s" / "12s". */
export function formatGrowTime(ms) {
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return `${h}h ${m}m`;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}
