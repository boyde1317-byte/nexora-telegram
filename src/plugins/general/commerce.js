/**
 * @file src/plugins/general/commerce.js
 *
 * .product / .ordercard / .pollresult — native WA commerce message types.
 *
 * The fork (baileys v0.3.18-r9) carries first-class builders for the legacy
 * commerce wire types that most Baileys forks expose only via raw relay
 * (and that xzcbailz's docs advertise, but half-broken):
 *
 *   .product <title> | <price> [currency] | [description] [| url]
 *     → Message.productMessage — the classic WhatsApp product card
 *       (image header + title/description + price + "Visit" link).
 *       Reply to an image to use it as the product image; falls back to
 *       the brand menu image. priceAmount1000 is in thousandths, so a
 *       price of 50 goes on the wire as 50000 — the plugin handles that.
 *       The fork's builder requires businessOwnerJid, so the sending
 *       session's own JID is attached (the card renders as "your" shop).
 *
 *   .ordercard <title> | <amount> [currency] | [note]
 *     → Message.orderMessage (status INQUIRY, surface CATALOG) — the
 *       "Gotta get a grip" style order bubble with total + thumbnail.
 *       Fork builder requires a thumbnail Buffer: replied image or the
 *       brand menu image.
 *
 *   .pollresult <name> | <option>:<votes> | <option>:<votes> ...
 *     → Message.pollResultSnapshotMessage — a finished-poll result card
 *       (PollType.POLL) with arbitrary vote counts.
 *
 * All three ride the fork's sendMessage builders / raw Message passthrough
 * — no client-side hacks, fully renderable on every WhatsApp client.
 */

import { imageManager } from '../../images/imageManager.js';

const DEFAULT_CURRENCY = 'GHS';

/** "50" | "50 ghs" | "50,GHS" → { amount, currency } */
function parsePrice(token) {
  const m = String(token || '').trim().match(/^([\d.,]+)\s*[,\s]\s*([A-Za-z]{3})$|^([\d.,]+)$|^([\d.,]+)\s+([A-Za-z]{3})$/);
  if (!m) return null;
  if (m[1]) return { amount: Number(m[1].replace(/,/g, '')), currency: m[2].toUpperCase() };
  if (m[3]) return { amount: Number(m[3].replace(/,/g, '')), currency: DEFAULT_CURRENCY };
  return { amount: Number(m[4].replace(/,/g, '')), currency: m[5].toUpperCase() };
}

/** The session's own user JID (strips the device suffix). */
function ownJid(sock) {
  const id = sock.user?.id || '';
  return id.split(':')[0].replace(/@s\.whatsapp\.net$/, '') + '@s.whatsapp.net';
}

async function resolveImage(m) {
  // 1. replied image
  const quoted = m.quoted;
  if (quoted && (quoted.imageMessage || quoted.message?.imageMessage)) {
    try {
      return { buffer: await quoted.download(), origin: 'replied image' };
    } catch { /* fall through */ }
  }
  // 2. brand menu image
  try {
    const img = await imageManager.getMenuImage(5);
    if (img?.buffer) return { buffer: img.buffer, origin: 'default' };
    if (img?.source?.startsWith?.('http')) {
      const res = await fetch(img.source);
      if (res.ok) return { buffer: Buffer.from(await res.arrayBuffer()), origin: 'default' };
    }
  } catch { /* fall through */ }
  return null;
}

export default {
  name: 'product',
  aliases: ['productcard', 'ordercard', 'pollresult', 'invoice', 'requestpayment', 'payreq'],
  category: 'general',
  description: 'Native WA commerce cards: .product (product card), .ordercard (order bubble), .pollresult (result snapshot).',
  cooldown: 10000,
  execute: async ({ sock, m, prefix, args, commandName }) => {
    const p = prefix || '.';
    const text = args.join(' ').trim();
    const command = commandName;
    try {
      const arg = (text || '').trim();
      const parts = arg.split('|').map(s => s.trim()).filter(Boolean);
      if (!parts.length) {
        return await m.reply.error(
          `Usage:\n\`${p}product Title | 50 GHS | Description\`\n\`${p}ordercard Title | 50 GHS | Note\`\n\`${p}pollresult Question | Option A:12 | Option B:8\`\n\n_Tip: reply to an image to use it as the product/thumbnail image._`
        );
      }

      // ── .product — Message.productMessage ──────────────────────────────
      if (command === 'product' || command === 'productcard') {
        const [title, priceTok, desc, url] = parts;
        const price = parsePrice(priceTok);
        if (!title || !price) {
          return await m.reply.error(`Invalid format. Usage: \`${p}product ${'Title'} | 50 GHS | Description\``);
        }
        const img = await resolveImage(m);
        if (!img) return await m.reply.error('No image available — reply to an image or set the default menu image.');

        await sock.sendMessage(m.from, {
          product: {
            title: title.slice(0, 160),
            description: (desc || title).slice(0, 400),
            priceAmount1000: Math.round(price.amount * 1000),
            currencyCode: price.currency,
            ...(url ? { url } : {})
          },
          businessOwnerJid: ownJid(sock),
          body: `${title}`,
          footer: `${price.amount} ${price.currency}`,
          image: img.buffer,
        }, { quoted: m });

        return await m.reply.success(
          `🛍️ Product card sent — *${title}* @ ${price.amount} ${price.currency} (image: ${img.origin})`
        );
      }

      // ── .ordercard — Message.orderMessage ──────────────────────────────
      if (command === 'ordercard') {
        const [title, priceTok, note] = parts;
        const price = parsePrice(priceTok);
        if (!title || !price) {
          return await m.reply.error(`Invalid format. Usage: \`${p}ordercard Order Title | 50 GHS | Note\``);
        }
        const img = await resolveImage(m);
        if (!img) return await m.reply.error('No thumbnail available — reply to an image or set the default menu image.');

        // Fork builder keys off `orderText` and requires `thumbnail` as a Buffer;
        // everything else is spread into the proto orderMessage fields.
        await sock.sendMessage(m.from, {
          orderText: note || title,
          orderTitle: title.slice(0, 120),
          totalAmount1000: Math.round(price.amount * 1000),
          totalCurrencyCode: price.currency,
          thumbnail: img.buffer,
        }, { quoted: m });

        return await m.reply.success(
          `🧾 Order card sent — *${title}* · total ${price.amount} ${price.currency} (thumbnail: ${img.origin})`
        );
      }

      // ── .pollresult — Message.pollResultSnapshotMessage ─────────────────
      if (command === 'pollresult') {
        const [name, ...voteParts] = parts;
        if (!name || voteParts.length < 2) {
          return await m.reply.error(`Need a question and 2+ options. Usage: \`${p}pollresult Best OS? | Ubuntu:34 | Debian:12\``);
        }
        const pollVotes = voteParts.map(vp => {
          const [opt, votes] = vp.split(':').map(s => s.trim());
          return { optionName: opt, optionVoteCount: Number(votes) || 0 };
        });
        const totalVotes = pollVotes.reduce((a, v) => a + v.optionVoteCount, 0);

        await sock.sendMessage(m.from, {
          pollResultSnapshotMessage: {
            name,
            pollType: 0, // proto.Message.PollType.POLL
            pollVotes
          }
        }, { quoted: m });

        return await m.reply.success(`📊 Poll result snapshot sent — *${name}* (${totalVotes} total votes)`);
      }

      // ── .invoice — Message.invoiceMessage ─────────────────────────────
      if (command === 'invoice') {
        const note = (parts.join(' ') || 'Invoice').slice(0, 300);
        const img = await resolveImage(m);
        if (!img) return await m.reply.error('No attachment available — reply to an image or set the default menu image.');

        // Fork builder keys off `invoiceNote` + a prepared image message:
        // builds invoiceMessage with attachment metadata + note + token.
        await sock.sendMessage(m.from, {
          image: img.buffer,
          invoiceNote: note
        }, { quoted: m });

        return await m.reply.success(`🧾 Invoice card sent — _${note.slice(0, 60)}_ (attachment: ${img.origin})`);
      }

      // ── .requestpayment — Message.requestPaymentMessage ────────────────
      if (command === 'requestpayment' || command === 'payreq') {
        const [priceTok, ...noteParts] = parts;
        const price = parsePrice(priceTok);
        if (!price) {
          return await m.reply.error(`Invalid format. Usage: \`${p}requestpayment 50 GHS | Note\` — reply to the person you're billing.`);
        }
        const note = noteParts.join(' ') || `Payment request: ${price.amount} ${price.currency}`;

        // Target: replied-to sender, mentioned user, or the command sender.
        const target = (m.quoted?.sender) || (m.mentionedJid?.[0]) || m.sender;

        // Fork builder keys off `requestPaymentFrom`; amount fields spread over
        // the IDR defaults. `text` rides along as the noteMessage (extendedText).
        await sock.sendMessage(m.from, {
          requestPaymentFrom: target,
          amount1000: Math.round(price.amount * 1000),
          currencyCodeIso4217: price.currency,
          amount: { currencyCode: price.currency, offset: 1000, value: Math.round(price.amount * 1000) },
          expiryTimestamp: Date.now() + 24 * 60 * 60 * 1000,
          text: note
        }, { quoted: m });

        return await m.reply.success(`💳 Payment request sent — *${price.amount} ${price.currency}* → ${String(target).split('@')[0]} (expires in 24h)`);
      }

            return await m.reply.error(`Unknown subcommand. Try \`${p}product\`, \`${p}ordercard\` or \`${p}pollresult\`.`);
    } catch (err) {
      console.error('[commerce] Error:', err);
      return await m.reply.error(`Commerce card failed: ${err.message}`);
    }
  },
};
