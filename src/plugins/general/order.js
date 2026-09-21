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
 * The buyer-facing confirmation card uses the .brand Moonson style:
 * »/› chevron body, status-quoted contact contextInfo, and the
 * booking_confirmation nativeFlow button that opens a full-screen
 * Order Details sheet (same machinery as .brand's Brand Details).
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

/** Status-quoted contact card contextInfo — same reply-bar effect as .brand. */
function brandOrderContext(botName, phone) {
  const vcard = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${botName} Bot`,
    `FN:${botName} Bot`,
    `ORG:${botName};`,
    `TEL;type=CELL;type=VOICE;waid=${phone}:+${phone}`,
    'END:VCARD',
  ].join('\r\n');
  return {
    mentionedJid: [],
    stanzaId: 'StatusBiz',
    participant: '0@s.whatsapp.net',
    remoteJid: 'status@broadcast',
    quotedMessage: { contactMessage: { displayName: botName, vcard } },
  };
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

    // ── .brand-style confirmation card (Moonson machinery) ─────────────
    const botName = brand.name;
    const phone   = (owner.ownerNumber || config.superOwner?.[0] || '').toString().replace(/[^0-9]/g, '');
    const waLink  = phone ? `https://wa.me/${phone}` : ownerWaLink();
    const groupLink = process.env.BRAND_GROUP_LINK || 'https://chat.whatsapp.com/GUgEw0Nd6CeEEmX7AQwnoQ';

    const sheet =
      `» *${botName}*\n` +
      `  › Order *${order.id}* — confirmed & queued\n\n` +
      `» *Your Order*\n` +
      `  › Plan: ${order.plan} RAM Server\n` +
      `  › Price: ${order.price} GHS\n` +
      `${note ? `  › Note: ${note}\n` : ''}\n` +
      `» *What Happens Next*\n` +
      `  › The owner reviews your order in their DM\n` +
      `  › Once approved you'll get a payment link\n` +
      `  › Quote *${order.id}* whenever you follow up\n\n` +
      `» *Order Policy*\n` +
      `  › Orders expire after ${ORDER_TTL_LABEL}\n` +
      `  › All prices in Ghana Cedis (GHS)\n\n` +
      `» *Need Help?*\n` +
      `${waLink ? `  › WhatsApp: wa.me/${phone}\n` : ''}` +
      `  › Group: ${groupLink}\n\n` +
      `_Powered by ${botName} — ${brand.signature}_`;

    const outerBody =
      `» *${botName}*\n` +
      `  › Order *${order.id}* confirmed & queued\n\n` +
      `» *Your Order*\n` +
      `  › ${order.plan} RAM Server · ${order.price} GHS\n` +
      `${note ? `  › Note: ${note}\n\n` : '\n'}` +
      `» *Next Step*\n` +
      `  › Owner reviews it — you'll hear back here shortly\n\n` +
      `_Tap the button below for full order details._`;

    const card = new Button(sock)
      .setTitle(`🧾 Order ${order.id}`)
      .setSubtitle(`${order.plan} Server · ${order.price} GHS`)
      .setBody(outerBody)
      .setFooter(brand.copyright || `© ${brand.name}`)
      .setContextInfo(brandOrderContext(botName, phone));

    // booking_confirmation — same full-screen sheet button as .brand
    card.addButton('booking_confirmation', {
      start_datetime: new Date().toISOString(),
      end_datetime: new Date(Date.now() + 600000).toISOString(),
      location: `${order.plan} Server Order`,
      booking_url: waLink || groupLink,
      phone_number: phone,
      booking_management_url: waLink || groupLink,
      description: sheet,
      email: '',
      display_text: `📋 View Order Details`,
      display_content: {
        display_language: 'en',
        display_meeting_type: 'Order Details',
        display_bottom_sheet_header: `📋 Order ${order.id}`,
        display_add_to_calendar_cta_text: 'ORDER',
        display_view_on_maps_cta_text: 'Contact Owner',
        display_manage_booking_cta_text: '📱 Contact Owner',
        display_manage_booking_not_supported_text: 'Order Info',
        display_read_more: 'View Details',
      },
    });
    card.addReply('🖥️ View Plans', `${p}store`);
    card.addReply('📋 Main Menu', `${p}menu`);
    try {
      const sent = await card.send(m.from, { quoted: m });
      if (sent) return;
    } catch (_) {}
    await m.reply.success(`✅ *Order ${order.id} filed* — *${plan.ram}* at ${plan.price} GHS. The owner reviews it in their DM; you'll hear back soon.`);
  },
};
