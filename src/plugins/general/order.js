/**
 * @file src/plugins/general/order.js
 *
 * .order — turn the store into an actual business.
 *
 * Anyone can file a server order (.order 4gb or a plan picker tap);
 * the super owner gets an interactive Approve/Deny card in their DM
 * (same machinery as the .pair approval flow). Approved orders get a
 * confirmation DM to the buyer with the owner's wa.me link to settle
 * payment; denied orders get a polite decline.
 *
 *   .order <ram> [note]   — file an order (e.g. .order 4gb monthly)
 *   .order list           — super owner: pending queue
 *   .orderapprove [id]    — super owner (also reachable via DM card)
 *   .orderdeny [id]       — super owner
 *
 * Plans come from the same STORE_PLANS env the store card reads, so the
 * picker rows and the order validation can never drift apart.
 */
import { Button } from '../../lib/moonsonKit.js';
import { actionCard } from '../../lib/interactiveKit.js';
import { fileOrder, listOrders, peekOrder, takeOrder, ORDER_TTL_LABEL } from '../../lib/orderStore.js';
import brand from '../../../config/brand.js';
import owner from '../../../config/owner.js';
import { config } from '../../../config/index.js';
import { client } from '../../core/client.js';

function loadPlans() {
  try {
    const raw = process.env.STORE_PLANS;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch { /* fall through */ }
  return null;
}

const DEFAULT_PLANS = [
  { ram: '1GB',  price: 10 },  { ram: '2GB',  price: 20 },
  { ram: '3GB',  price: 30 },  { ram: '4GB',  price: 40 },
  { ram: '5GB',  price: 50 },  { ram: '6GB',  price: 60 },
  { ram: '8GB',  price: 80 },  { ram: '10GB', price: 100 },
];

function allPlans() {
  return loadPlans() || DEFAULT_PLANS;
}

/** Resolve a plan token like "4", "4gb", "4 GB", "10gb" against plans. */
function matchPlan(token) {
  const t = String(token || '').toLowerCase().replace(/[^0-9a-z]/g, '');
  if (!t) return null;
  for (const plan of allPlans()) {
    const ram = String(plan.ram).toLowerCase().replace(/[^0-9a-z]/g, '');
    if (ram === t || ram === `${t}gb` || t === ram.replace('gb', '')) return plan;
  }
  return null;
}

function superOwnerJid() {
  const num = config.superOwner?.[0];
  return num ? `${num}@s.whatsapp.net` : null;
}

function ownerWaLink() {
  const phone = (owner.ownerNumber || config.superOwner?.[0] || '').toString().replace(/[^0-9]/g, '');
  return phone ? `https://wa.me/${phone}` : null;
}

async function sendOrderCard(order) {
  const target = superOwnerJid();
  if (!target || !client.socket?.user) return false;
  const note = order.note ? `Note: _${order.note}_\n` : '';
  const body =
    `🛒 *NEW SERVER ORDER* — ${order.id}\n\n` +
    `Plan: *${order.plan}* (${order.price} GHS)\n` +
    `Buyer: ${order.buyerName || 'unknown'} (${order.buyerJid.split('@')[0]})\n` +
    `${note}\n` +
    `Approve sends the buyer a confirmation with your payment link. Orders expire after ${ORDER_TTL_LABEL}.`;
  try {
    await actionCard(client.socket, target, {
      text: body,
      footer: `${brand.name} • Order approval`,
    }, [
      { label: '✅ Approve', cmd: `.orderapprove ${order.id}` },
      { label: '❌ Deny',    cmd: `.orderdeny ${order.id}` },
    ]);
    return true;
  } catch (err) {
    console.warn('[order] approval card failed, plain fallback:', err.message || err);
    try {
      await client.socket.sendMessage(target, {
        text: `${body}\n\nApprove: .orderapprove ${order.id}\nDeny: .orderdeny ${order.id}`,
      });
      return true;
    } catch (_) { return false; }
  }
}

async function notifyBuyer(order, approved) {
  try {
    const sock = client.socket;
    if (!sock?.user) return;
    if (approved) {
      const link = ownerWaLink();
      await sock.sendMessage(order.buyerJid, {
        text:
          `✅ *Your order was APPROVED!*\n\n` +
          `Plan: *${order.plan}* — ${order.price} GHS\n` +
          `${order.note ? `Your note: _${order.note}_\n` : ''}` +
          `${link ? `Next step — settle payment with the owner:\n${link}\n` : `The owner will reach out to settle payment.\n`}` +
          `Quote order *${order.id}* so it's easy to match.`,
      });
    } else {
      await sock.sendMessage(order.buyerJid, {
        text: `❌ Your order (*${order.plan}*, ${order.id}) was declined. No hard feelings — you can check current plans with \`.store\`.`,
      });
    }
  } catch (_) {}
}

export default {
  name: 'order',
  aliases: ['orders', 'buyserver'],
  category: 'general',
  description: 'Order a server plan. Usage: .order <plan> [note] — e.g. .order 4gb monthly. Super owner: .order list / .orderapprove / .orderdeny',
  cooldown: 15000,
  permissions: { owner: false },
  requestable: true, // works in private mode — it only FILES a request

  async execute({ sock, m, args, prefix }) {
    const p = prefix || '.';
    const sub = (args[0] || '').toLowerCase();

    // ── Super-owner queue management ────────────────────────────────────
    if (sub === 'list') {
      if (!(await m.isSuperOwner)) return await m.reply.error(`*Super owner only.*`);
      const all = listOrders();
      if (!all.length) return await m.reply.info('No pending orders.', 'ORDER QUEUE');
      return await m.reply(
        `🛒 *PENDING ORDERS*\n\n` +
        all.map(o => `\`${p}orderapprove ${o.id}\` ← *${o.plan}* (${o.price} GHS) by ${o.buyerName || o.buyerJid.split('@')[0]}${o.note ? ` — _${o.note}_` : ''}`).join('\n')
      );
    }

    if (sub === 'approve' || sub === 'deny') {
      if (!(await m.isSuperOwner)) return await m.reply.error(`*Super owner only.*`);
      const target = args[1] ? peekOrder(args[1]) : (listOrders().length === 1 ? listOrders()[0] : null);
      if (!target) {
        return await m.reply.error(args[1]
          ? `No pending order matching *${args[1]}*.`
          : `Several orders pending — pick one: ${listOrders().map(o => o.id).join(', ')}`);
      }
      const order = takeOrder(target.id);
      await notifyBuyer(order, sub === 'approve');
      return await m.reply.success(
        sub === 'approve'
          ? `✅ *Order ${order.id} approved* (${order.plan} — ${order.price} GHS).\nThe buyer got a confirmation with your payment link.`
          : `❌ *Order ${order.id} declined* (${order.plan}).\nThe buyer has been informed.`
      );
    }

    // ── File an order ──────────────────────────────────────────────────
    if (!args.length) {
      const plans = allPlans().map(pl => `\`${p}order ${String(pl.ram).toLowerCase()}\` — ${pl.ram} @ ${pl.price} GHS`).join('\n');
      return await m.reply.info(
        `🖥️ *ORDER A SERVER*\n\n\`${p}order <plan> [note]\`\n\n${plans}\n\nYour order goes to the owner for approval — you'll get a DM once it's reviewed. Orders expire after ${ORDER_TTL_LABEL}.`,
        'ORDER'
      );
    }

    const plan = matchPlan(args[0]);
    if (!plan) {
      return await m.reply.error(`Unknown plan *${args[0]}*. Check \`${p}store\` for current plans — e.g. \`${p}order 4gb\`.`);
    }
    const note = args.slice(1).join(' ').slice(0, 200) || null;
    const buyerJid = m.isGroup ? m.sender : m.from;
    const buyerName = m.pushName || m.sender.split('@')[0];

    let order;
    try {
      order = fileOrder({ plan: String(plan.ram), price: plan.price, note, buyerJid, buyerName, chatJid: m.from });
    } catch (err) {
      return await m.reply.warn(err.message);
    }

    const delivered = await sendOrderCard(order);
    if (!delivered) {
      // Queue it anyway — the owner can still see it via .order list.
      return await m.reply.warn(
        `Order *${order.id}* (*${order.plan}* — ${plan.price} GHS) is queued, but I couldn't reach the owner right now. They'll see it via \`${p}order list\`.`
      );
    }

    const card = new Button(sock)
      .setTitle(`🧾 Order ${order.id}`)
      .setSubtitle(`${plan.ram} Server · ${plan.price} GHS`)
      .setBody(
        `✅ *ORDER FILED*\n\n` +
        `Plan: *${plan.ram} RAM Server*\n` +
        `Price: *${plan.price} GHS*\n` +
        `${note ? `Note: _${note}_\n` : ''}\n` +
        `The owner reviews it in their DM — you'll hear back here shortly. ` +
        `Quote *${order.id}* if you follow up. Orders expire after ${ORDER_TTL_LABEL}.`
      )
      .setFooter(brand.copyright || `© ${brand.name}`);
    card.addReply('🖥️ View Plans', `${p}store`);
    card.addReply('📋 Main Menu', `${p}menu`);
    try {
      const sent = await card.send(m.from, { quoted: m });
      if (sent) return;
    } catch (_) {}
    await m.reply.success(`✅ *Order ${order.id} filed* — *${plan.ram}* at ${plan.price} GHS. The owner reviews it in their DM; you'll hear back soon.`);
  },
};
