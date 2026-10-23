/**
 * farm.js — NEXORA Farm: the OURIN DELUXE garden game, NEXORA-styled.
 *
 * Ported from OURIN DELUXE V3.4.1 (plugins/rpg/garden.js + berladang.js):
 * buy seeds with coins, plant them in plots, wait for them to grow,
 * harvest for crops + XP, sell crops for coins. Growth is timestamp-based,
 * so plots keep growing while the bot is offline.
 *
 * The status dashboard is delivered through the VIP unified-response
 * envelope (vipRichKit — the .vipcard pattern, finally doing real work):
 * product-card header, plot table, seed inventory and a market gallery
 * in one card. Falls back to plain text on non-rich devices.
 *
 * Usage:
 *   .farm                  → VIP-card farm dashboard
 *   .farm status           → same dashboard
 *   .farm buy <crop> [qty] → buy seeds with coins
 *   .farm plant <crop>     → plant a seed in a free plot
 *   .farm harvest          → harvest every ready plot (+XP)
 *   .farm sell [crop|all]  → sell harvested crops for coins
 *   .farm market           → crop catalog table
 *   .farm upgrade          → buy one more plot (250 × current capacity)
 */
import capabilities from '../../core/capabilities.js';
import { baileysBridge } from '../../core/baileysBridge.js';
import { withReactionStatus } from '../../lib/cosmetics.js';
import { grantXp, rankBadge, xpToLevel } from '../../economy/leveling.js';
import { withUserLock } from '../../economy/leveling.js';
import {
  sendUnifiedRich, productItemCard, markdownText, extWidget,
  followUpPills, singleSection, hScrollSection,
} from '../../lib/vipRichKit.js';
import {
  FARM_CROPS, getFarm, plotCapacity, plotStatus, plantSeed,
  harvestPlots, sellCrops, upgradeCost, formatGrowTime,
} from '../../lib/farm.js';

export default {
  name: 'farm',
  aliases: ['garden', 'berladang'],
  category: 'economy',
  description: '🌾 Grow crops, harvest and sell them for coins. Usage: .farm [status/buy/plant/harvest/sell/market/upgrade]',
  cooldown: 5000,

  execute: async ({ m, sock, db, args, prefix }) => {
    const p = prefix || '.';
    const action = args[0]?.toLowerCase();
    const cropKey = args[1]?.toLowerCase();

    await withReactionStatus(m, async () => {
      const user = db.getUser(m.sender);
      const farm = getFarm(user);

      // ── Dashboard (.farm / .farm status) — VIP envelope rich tier ──────
      if (!action || action === 'status') {
        const plots = plotStatus(farm);
        const level = xpToLevel(user.xp ?? 0);
        const badge = rankBadge(level);
        const coins = user.coins ?? 0;
        const capacity = plotCapacity(farm);
        const seedKeys = Object.keys(farm.seeds);
        const cropKeys = Object.keys(farm.crops);

        const plotsTxt = plots.length === 0
          ? `_Empty farm — ${capacity} plots ready. Buy seeds:_ \`${p}farm buy carrot\` _then_ \`${p}farm plant carrot\``
          : plots.map(pl =>
              `📍 Plot ${pl.index + 1}: *${pl.name}* — ${pl.ready ? '✨ *READY TO HARVEST!*' : `⏳ ${formatGrowTime(pl.remaining)}`}`
            ).join('\n');

        const seedsTxt = seedKeys.length
          ? seedKeys.map(k => `${FARM_CROPS[k].name} ×${farm.seeds[k]}`).join(' · ')
          : '_no seeds — visit the market_';
        const siloTxt = cropKeys.length
          ? cropKeys.map(k => `${FARM_CROPS[k].name} ×${farm.crops[k]}`).join(' · ')
          : '_empty silo — harvest first_';

        // ── Rich tier: VIP unified-response envelope (.vipcard pattern) ──
        if (capabilities.richResponse) {
          try {
            return await sendUnifiedRich(sock, m.from, {
              disclaimer: 'NEXORA Farm',
              submessages: [{ messageType: 2, messageText: `🌾 NEXORA Farm — Farmer ${badge}` }],
              sections: [
                singleSection(productItemCard({
                  title: `🌾 NEXORA Farm • ${badge}`,
                  brand: 'NEXORA',
                  price: `${coins.toLocaleString()} coins`,
                  productUrl: 'https://wa.me/' + (m.sender?.split('@')[0] || ''),
                  imageUrl: 'https://res.cloudinary.com/di2a9lenz/image/upload/v1786909227/omegatech_ai_media/upload-1786909226872.jpg',
                })),
                singleSection(markdownText(
                  `🌱 *Plots* (${plots.length}/${capacity})\n\n${plotsTxt}\n\n` +
                  `🎒 *Seeds:* ${seedsTxt}\n🧺 *Silo:* ${siloTxt}`
                )),
                hScrollSection([
                  extWidget({
                    title: '⚡ Farm Actions',
                    ctas: [
                      { label: 'Harvest', toast: `.farm harvest`, toolCallId: '00' },
                      { label: 'Market', toast: `.farm market`, toolCallId: '01' },
                      { label: 'Sell all', toast: `.farm sell all`, toolCallId: '02' },
                    ],
                  }),
                  ...followUpPills(['F', 'A', 'R', 'M']),
                  ...['carrot', 'strawberry', 'pumpkin'].map(k =>
                    productItemCard({
                      title: FARM_CROPS[k].name,
                      brand: 'Seed',
                      price: `${FARM_CROPS[k].seedPrice}c`,
                      salePrice: `${formatGrowTime(FARM_CROPS[k].growMs)} grow`,
                    })),
                ]),
                singleSection(markdownText(
                  `🛒 *Get started:*\n\`${p}farm buy carrot\` → \`${p}farm plant carrot\` → \`${p}farm harvest\` → \`${p}farm sell all\`\n\n` +
                  `_Full catalog:_ \`${p}farm market\` · _More plots:_ \`${p}farm upgrade\``
                )),
              ],
              quoted: m,
            });
          } catch (err) {
            console.warn('[farm] VIP envelope failed, text fallback:', err.message);
          }
        }

        // ── Plain-text fallback ────────────────────────────────────────────
        return await m.reply(
          `🌾 *NEXORA FARM* — Farmer ${badge}\n\n` +
          `🌱 *Plots* (${plots.length}/${capacity})\n${plotsTxt}\n\n` +
          `🎒 *Seeds:* ${seedsTxt}\n🧺 *Silo:* ${siloTxt}\n\n` +
          `🛒 \`${p}farm buy <crop>\` · \`${p}farm plant <crop>\` · \`${p}farm harvest\` · \`${p}farm sell all\` · \`${p}farm market\``
        );
      }

      // ── Market — crop catalog table ─────────────────────────────────────
      if (action === 'market') {
        const rows = Object.entries(FARM_CROPS).map(([key, c]) =>
          [c.name, formatGrowTime(c.growMs), `${c.seedPrice}c`, `${c.sellPrice}c`, key]);
        const headers = ['Crop', 'Grow Time', 'Seed', 'Sells For', 'Key'];

        if (capabilities.richResponse) {
          try {
            return await baileysBridge.sendRichTable(sock, m.from, {
              title: '🌾 NEXORA Farm Market',
              headers,
              rows,
              footer: `Buy: ${p}farm buy <key> [qty] • Sell: ${p}farm sell <key>`,
            }, { quoted: m });
          } catch (err) {
            console.warn('[farm] market table failed, text fallback:', err.message);
          }
        }
        return await m.reply(
          `🌾 *FARM MARKET*\n\n` +
          rows.map(r => `${r[0]} — grow ${r[1]} · seed ${r[2]} · sells ${r[3]} _(key: ${r[4]})_`).join('\n')
        );
      }

      // ── Mutating actions — run under the user lock ──────────────────────
      return await withUserLock(m.sender, async () => {
        const fresh = db.getUser(m.sender);
        const f = getFarm(fresh);

        // Buy seeds with coins
        if (action === 'buy') {
          const crop = FARM_CROPS[cropKey];
          if (!crop) {
            return await m.reply.error(`Unknown crop. See \`${p}farm market\` for the catalog.`);
          }
          const qty = Math.max(1, parseInt(args[2], 10) || 1);
          const cost = crop.seedPrice * qty;
          if ((fresh.coins ?? 0) < cost) {
            return await m.reply.warn(
              `Not enough coins — ${crop.name} seeds cost *${cost}c* (you have ${(fresh.coins ?? 0).toLocaleString()}c).`
            );
          }
          fresh.coins = (fresh.coins ?? 0) - cost;
          f.seeds[cropKey] = (f.seeds[cropKey] || 0) + qty;
          db.save();
          return await m.reply(
            `🛒 Bought *${qty}× ${crop.name} seed${qty > 1 ? 's' : ''}* for *${cost}c*.\n` +
            `Plant now: \`${p}farm plant ${cropKey}\` 🌱`
          );
        }

        // Plant a seed
        if (action === 'plant') {
          const result = plantSeed(f, cropKey);
          if (!result.ok) {
            const msg = {
              'unknown-crop': `Unknown crop. See \`${p}farm market\`.`,
              'no-seed': `You have no ${FARM_CROPS[cropKey]?.name ?? cropKey} seeds — buy some: \`${p}farm buy ${cropKey}\`.`,
              'plots-full': `All plots are in use (${f.plots.length}/${plotCapacity(f)}). Harvest first or \`${p}farm upgrade\`.`,
            }[result.reason] || 'Could not plant.';
            return await m.reply.warn(msg);
          }
          db.save();
          return await m.reply(
            `🌱 Planted *${result.crop.name}* in plot ${f.plots.length}.\n` +
            `Ready in *${formatGrowTime(result.crop.growMs)}* — check with \`${p}farm\`.`
          );
        }

        // Harvest ready plots
        if (action === 'harvest') {
          const { harvested, xp } = harvestPlots(f);
          if (harvested.length === 0) {
            const next = plotStatus(f).filter(pl => !pl.ready).sort((a, b) => a.remaining - b.remaining)[0];
            return await m.reply.warn(
              next
                ? `Nothing ready yet — next harvest: *${next.name}* in ⏳ ${formatGrowTime(next.remaining)}.`
                : `Nothing planted. \`${p}farm buy carrot\` → \`${p}farm plant carrot\` 🌱`
            );
          }
          grantXp(db, m.sender, { xp });
          db.save();
          const lines = harvested.map(h => `• ${h.name} ×${h.qty}`).join('\n');
          const totalXp = xp;

          if (capabilities.richResponse) {
            try {
              return await baileysBridge.sendRichTable(sock, m.from, {
                title: '🚜 Harvest Collected!',
                headers: ['Crop', 'Yield'],
                rows: harvested.map(h => [h.name, `×${h.qty}`]),
                footer: `📈 +${totalXp} XP • sell with ${p}farm sell all`,
              }, { quoted: m });
            } catch (err) {
              console.warn('[farm] harvest table failed, text fallback:', err.message);
            }
          }
          return await m.reply(
            `🚜 *HARVEST COLLECTED!*\n\n${lines}\n\n📈 *+${totalXp} XP*\nSell it all: \`${p}farm sell all\` 💰`
          );
        }

        // Sell crops for coins
        if (action === 'sell') {
          const key = cropKey || 'all';
          const { ok, items, total } = sellCrops(f, key);
          if (!ok) {
            return await m.reply.warn(
              key === 'all'
                ? `Your silo is empty — harvest something first (\`${p}farm harvest\`).`
                : `No ${key} in your silo. Check \`${p}farm\`.`
            );
          }
          grantXp(db, m.sender, { coins: total, xp: Math.floor(total / 10) });
          db.save();
          const lines = items.map(i => `• ${i.name} ×${i.qty} → *+${i.coins}c*`).join('\n');
          return await m.reply(
            `💰 *SOLD!*\n\n${lines}\n\n🪙 *+${total.toLocaleString()} coins*\n\n` +
            `Keep the cycle going: \`${p}farm buy <crop>\` 🌱`
          );
        }

        // Upgrade plot capacity
        if (action === 'upgrade') {
          if (plotCapacity(f) >= 9) {
            return await m.reply.warn('Your farm is fully expanded — 9/9 plots. 🏆');
          }
          const cost = upgradeCost(f);
          if ((fresh.coins ?? 0) < cost) {
            return await m.reply.warn(`Next plot costs *${cost}c* — you have ${(fresh.coins ?? 0).toLocaleString()}c.`);
          }
          fresh.coins = (fresh.coins ?? 0) - cost;
          f.upgrades = (f.upgrades || 0) + 1;
          db.save();
          return await m.reply(
            `🏗️ Farm expanded! *${plotCapacity(f)}/9 plots* now.\nCost: *${cost}c* — plant something new: \`${p}farm plant <crop>\` 🌱`
          );
        }

        return await m.reply.info(
          `Usage: \`${p}farm [status|market|buy|plant|harvest|sell|upgrade]\`\nExample: \`${p}farm buy carrot\`, \`${p}farm harvest\``,
          'NEXORA FARM'
        );
      });
    });
  },
};
