/**
 * @file src/plugins/general/store.js
 *
 * .store — Pterodactyl server plans, renderable Moonson-style.
 *
 * Moonson's .store rides the AIRich GenAI envelope (product cards) which
 * bubbles as the "your version of WhatsApp" placeholder on non-GenAI
 * clients — so this is a reimagining, not a verbatim port: the same plan
 * list and Moonson visual language, built entirely on renderable
 * interactiveMessage/nativeFlowMessage primitives via moonsonKit.Button:
 *
 *   - single_select plan picker sheet (tap a plan → .owner to order)
 *   - quick_reply pills (.ping / .menu)
 *   - cta_url contact button (wa.me deep link)
 *
 * Plan data is env-overridable via STORE_PLANS (JSON), defaults mirror
 * Moonson's AizenPanel pricing.
 */

import { Button } from '../../lib/moonsonKit.js';
import brand from '../../../config/brand.js';
import owner from '../../../config/owner.js';
import { toSmallcaps } from '../../lib/smallcaps.js';

const DEFAULT_PLANS = [
  { ram: '1GB',  price: 10 },
  { ram: '2GB',  price: 20 },
  { ram: '3GB',  price: 30 },
  { ram: '4GB',  price: 40 },
  { ram: '5GB',  price: 50 },
  { ram: '6GB',  price: 60 },
  { ram: '8GB',  price: 80 },
  { ram: '10GB', price: 100 },
];

function loadPlans() {
  try {
    const raw = process.env.STORE_PLANS;
    if (!raw) return DEFAULT_PLANS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    // fall through to defaults
  }
  return DEFAULT_PLANS;
}

export default {
  name: 'store',
  aliases: ['servers', 'hosting'],
  category: 'general',
  description: 'Server hosting plans with an interactive plan picker (Moonson-style card).',
  cooldown: 5000,
  execute: async ({ sock, m, prefix }) => {
    const p = prefix || '.';
    try {
      const plans = loadPlans();
      const phone = (owner.ownerNumber || '').replace(/[^0-9]/g, '');
      const cheapest = plans.reduce((a, b) => (a.price <= b.price ? a : b));
      const priciest = plans.reduce((a, b) => (a.price >= b.price ? a : b));

      const listText = plans
        .map((plan, i) => `${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} *${plan.ram} RAM Server* — ${plan.price} GHS`)
        .join('\n');

      const bodyText =
        `\`\${brand.name} Pterodactyl Server Store\` 🖥️\n` +
        `${listText}\n\n` +
        `High-performance Pterodactyl servers.\n` +
        `Prices from *${cheapest.price} GHS* to *${priciest.price} GHS*.\n\n` +
        `All plans include:\n` +
        `» Full Root Access\n` +
        `» 24/7 Uptime\n` +
        `» Free SSL\n` +
        `» Dedicated IP\n` +
        `» One-Click Apps\n` +
        `» Instant Setup\n\n` +
        `💡 *Tap a plan below to order it* — the owner approves, you get a DM. Custom plans? Message the owner.\n\n` +
        `_Your server, your rules._ ♥︎`;

      const card = new Button(sock)
        .setTitle(`🖥️ ${toSmallcaps(brand.name)} Store`)
        .setSubtitle(`${toSmallcaps('Pterodactyl Hosting')} · ${plans.length} ${toSmallcaps('plans')}`)
        .setBody(bodyText)
        .setFooter(brand.copyright || `© ${brand.name}`);

      // ── Plan picker — tapping a plan files an order (.order approval
      //    flow) instead of dumping the buyer into a bare .owner DM ──
      card.addSelection(toSmallcaps('Order a Plan'));
      card.makeSection(toSmallcaps('Server Plans'));
      for (const plan of plans) {
        card.makeRow(
          '',
          `${plan.ram} RAM Server`,
          `${plan.price} GHS · Tap to order`,
          `${p}order ${String(plan.ram).toLowerCase()}`,
        );
      }

      // ── Action pills ──
      card.addReply(`⚡ ${toSmallcaps('System Info')}`, `${p}ping`);
      card.addReply(`📋 ${toSmallcaps('Main Menu')}`, `${p}menu`);
      card.addUrl(`💬 ${toSmallcaps('Order Now')}`, `https://wa.me/${phone}`);

      await card.send(m.from, { quoted: m });
    } catch (err) {
      console.error('[store] Error:', err);
      return await m.reply.error(`Failed to render store card: ${err.message}`);
    }
  },
};
