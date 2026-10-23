/**
 * tempmail.js — disposable email inboxes (ported from OURIN DELUXE V3.4.1).
 *
 * Create a throwaway address, use it for sign-ups, and read whatever
 * arrives — without handing out your real email.
 *
 *   .tempmail             → overview + your active address
 *   .tempmail create      → new address (replaces the old one)
 *   .tempmail inbox       → check for incoming mail
 *   .tempmail read <n>    → full body of message n
 *
 * Rich tier: create/inbox are delivered through the VIP unified-response
 * envelope (vipRichKit — the .vipcard pattern doing real work): product-card
 * header, message gallery in an hscroll, action pills. The create card is
 * followed by one short plain-text line carrying the bare address so it can
 * be copied. Plain-text fallbacks on non-rich devices.
 */
import capabilities from '../../core/capabilities.js';
import { withReactionStatus } from '../../lib/cosmetics.js';
import {
  sendUnifiedRich, productItemCard, markdownText, extWidget,
  followUpPills, singleSection, hScrollSection,
} from '../../lib/vipRichKit.js';
import { createTempMail, getInbox, formatMailTime } from '../../lib/tempmail.js';

const BRAND_IMAGE = 'https://res.cloudinary.com/di2a9lenz/image/upload/v1786909227/omegatech_ai_media/upload-1786909226872.jpg';

export default {
  name: 'tempmail',
  aliases: ['tmpmail', 'tmp'],
  category: 'utility',
  description: '📧 Disposable email inboxes. Usage: .tempmail [create|inbox|read]',
  cooldown: 4000,

  execute: async ({ m, sock, db, args, prefix }) => {
    const p = prefix || '.';
    const action = args[0]?.toLowerCase();
    const user = db.getUser(m.sender);

    await withReactionStatus(m, async () => {
      // ── Overview ──────────────────────────────────────────────────────
      if (!action) {
        return await m.reply.info(
          `📧 *TEMP MAIL*\n\n` +
          `A disposable inbox — receive sign-up mails without your real email.\n\n` +
          `\`${p}tempmail create\` — new address\n` +
          `\`${p}tempmail inbox\` — check for mail\n` +
          `\`${p}tempmail read <n>\` — read a message\n\n` +
          (user.tempmail
            ? `📬 Your active address: *${user.tempmail}*`
            : `_No address yet — \`${p}tempmail create\` first._`),
          'NEXORA TEMP MAIL'
        );
      }

      // ── Create a new address ──────────────────────────────────────────
      if (action === 'create' || action === 'new') {
        const result = await createTempMail();
        if (!result.ok) {
          return await m.reply.error(`Could not create an inbox: ${result.error}`);
        }
        user.tempmail = result.email;
        db.save();

        const email = result.email;

        if (capabilities.richResponse) {
          try {
            await sendUnifiedRich(sock, m.from, {
              disclaimer: 'NEXORA Temp Mail',
              submessages: [{ messageType: 2, messageText: '📧 Disposable inbox ready' }],
              sections: [
                singleSection(productItemCard({
                  title: '📧 Temp Mail Created',
                  brand: 'NEXORA',
                  price: 'Active now',
                  productUrl: 'https://temp-mail.io',
                  imageUrl: BRAND_IMAGE,
                })),
                singleSection(markdownText(
                  `✅ *Your disposable inbox is ready*\n\n` +
                  `Use it for sign-ups, verifications, one-off downloads — anything you don't want tied to your real email.\n\n` +
                  `📬 Check for mail: \`${p}tempmail inbox\` · Read: \`${p}tempmail read <n>\`\n\n` +
                  `_Throwaway by design — don't use it for anything important._`
                )),
                hScrollSection([
                  extWidget({
                    title: '⚡ Temp Mail',
                    ctas: [
                      { label: 'Inbox', toast: `${p}tempmail inbox`, toolCallId: '00' },
                      { label: 'New one', toast: `${p}tempmail create`, toolCallId: '01' },
                    ],
                  }),
                  ...followUpPills(['T', 'E', 'M', 'P']),
                  productItemCard({ title: '📬 Your inbox', brand: 'temp-mail.io', price: 'waiting for mail', salePrice: 'disposable' }),
                ]),
              ],
              quoted: m,
            });
            // The card is the presentation — this line is the copyable address.
            return await m.reply(`📬 \`${email}\``);
          } catch (err) {
            console.warn('[tempmail] VIP envelope failed, text fallback:', err.message);
          }
        }

        return await m.reply(
          `📧 *DISPOSABLE INBOX CREATED*\n\n` +
          `📬 *${email}*\n\n` +
          `Use it for sign-ups — check what arrives with \`${p}tempmail inbox\`.\n\n` +
          `_Throwaway by design — don't use it for anything important._`
        );
      }

      // ── Inbox ─────────────────────────────────────────────────────────
      if (action === 'inbox' || action === 'check') {
        const email = user.tempmail;
        if (!email) {
          return await m.reply.warn(`No active address yet — create one first: \`${p}tempmail create\``);
        }
        const result = await getInbox(email);
        if (!result.ok) {
          return await m.reply.error(`Could not check the inbox: ${result.error}`);
        }
        const msgs = result.messages;

        if (capabilities.richResponse) {
          try {
            const listTxt = msgs.length === 0
              ? `📭 *Inbox empty* — nothing has arrived at ${email} yet. Check again with \`${p}tempmail inbox\`.`
              : msgs.map((msg, i) =>
                  `📧 *${i + 1}.* ${msg.subject ? `*${msg.subject}* — ` : ''}${msg.from}\n` +
                  `🕐 ${formatMailTime(msg.created_at)} · \`${p}tempmail read ${i + 1}\``
                ).join('\n\n');

            await sendUnifiedRich(sock, m.from, {
              disclaimer: 'NEXORA Temp Mail',
              submessages: [{ messageType: 2, messageText: `📬 Inbox — ${msgs.length} message${msgs.length === 1 ? '' : 's'}` }],
              sections: [
                singleSection(productItemCard({
                  title: `📬 ${email}`,
                  brand: 'temp-mail.io',
                  price: msgs.length === 0 ? 'No new mail' : `${msgs.length} message${msgs.length === 1 ? '' : 's'}`,
                  imageUrl: BRAND_IMAGE,
                })),
                singleSection(markdownText(listTxt)),
                ...(msgs.length > 0
                  ? [hScrollSection([
                      ...msgs.slice(0, 6).map((msg, i) =>
                        productItemCard({
                          title: String(msg.subject || 'No subject').slice(0, 60),
                          brand: String(msg.from || 'unknown').slice(0, 30),
                          price: formatMailTime(msg.created_at),
                          salePrice: `read: .tempmail read ${i + 1}`,
                        })),
                      extWidget({
                        title: '⚡ Temp Mail',
                        ctas: [
                          { label: 'Refresh', toast: `${p}tempmail inbox`, toolCallId: '00' },
                          { label: 'New address', toast: `${p}tempmail create`, toolCallId: '01' },
                        ],
                      }),
                    ])]
                  : []),
              ],
              quoted: m,
            });
            return;
          } catch (err) {
            console.warn('[tempmail] VIP envelope failed, text fallback:', err.message);
          }
        }

        if (msgs.length === 0) {
          return await m.reply(`📭 *Inbox empty*\n\n> ${email}\n\nNothing yet — check again later with \`${p}tempmail inbox\`.`);
        }
        const txt = msgs.map((msg, i) =>
          `📧 *${i + 1}. ${msg.subject || 'No subject'}*\n` +
          `From: ${msg.from} · ${formatMailTime(msg.created_at)}\n` +
          `${(msg.body_text || '').substring(0, 400) || '_(no body)'}`
        ).join('\n\n');
        return await m.reply(
          `📬 *INBOX — ${msgs.length} message${msgs.length === 1 ? '' : 's'}*\n> ${email}\n\n${txt}\n\n_Full text:_ \`${p}tempmail read <n>\``
        );
      }

      // ── Read a message body ────────────────────────────────────────────
      if (action === 'read') {
        const email = user.tempmail;
        const n = parseInt(args[1], 10);
        if (!email) return await m.reply.warn(`No active address — \`${p}tempmail create\` first.`);
        if (!Number.isInteger(n) || n < 1) return await m.reply.warn(`Usage: \`${p}tempmail read <n>\` — message number from \`${p}tempmail inbox\`.`);

        const result = await getInbox(email);
        if (!result.ok) return await m.reply.error(`Could not check the inbox: ${result.error}`);
        const msg = result.messages[n - 1];
        if (!msg) return await m.reply.warn(`No message ${n} — the inbox has ${result.messages.length}.`);

        return await m.reply(
          `📧 *${msg.subject || 'No subject'}*\n` +
          `From: *${msg.from}*\n🕐 ${formatMailTime(msg.created_at)}\n\n` +
          `${msg.body_text || '_(empty body)_'}`.slice(0, 3800)
        );
      }

      return await m.reply.info(
        `Usage: \`${p}tempmail [create|inbox|read <n>]\``,
        'NEXORA TEMP MAIL'
      );
    });
  },
};
