/**
 * check.js — WhatsApp number ban checker.
 *
 * `.check <number>`        — check any number (any country, no session needed)
 * `.check` (reply/@mention) — check the quoted/mentioned user's number
 *
 * Verdicts:
 *   Not banned        — on WhatsApp right now
 *   BANNED            — WhatsApp confirmed the ban (probe reason)
 *   Likely banned     — the number was on WhatsApp before (history) and is
 *                       gone now; plain exists queries can't say more
 *   Never on WhatsApp — never registered
 *
 * How it works: a sessionless, tokenless probe of WhatsApp's own
 * registration endpoint (verified live 2026-10-23) answers "is this
 * account registered" for ANY number, plus a local sighting history that
 * separates *banned* from *never existed* — the thing plain onWhatsApp
 * lookups get wrong. See src/lib/bancheck.js for details and calibration
 * notes.
 */

import { checkNumber, BAN_STATUS_TEXT, TOKENLESS_UA } from '../../lib/bancheck.js';

export default {
  name: 'check',
  aliases: ['checkwa', 'wa'],
  category: 'utility',
  description: 'Check whether a number is on WhatsApp, banned, or never registered. Usage: .check <number> (or reply / @mention)',
  cooldown: 15000,

  execute: async ({ m, sock, args }) => {
    // resolve target: explicit number > @mention > quoted sender > usage
    const digits = args.join('').replace(/\D/g, '');
    const mention = m.msg?.contextInfo?.mentionedJid?.[0] || m.mentionedJid?.[0];
    const quoted = m.quoted?.sender;
    let target = digits;
    if (!target && mention) target = String(mention).split('@')[0];
    if (!target && quoted) target = String(quoted).split('@')[0];

    if (!target || target.replace(/\D/g, '').length < 7) {
      return m.reply.warn(
        'Usage: *.check <number>*\n' +
        'Example: `.check +233 54 123 4567`\n' +
        'Or reply to a message / @mention someone to check their number.'
      );
    }

    await m.reply.loading('Checking with WhatsApp…');
    let result;
    try {
      result = await checkNumber(sock, target);
    } catch (err) {
      return m.reply.error(`Check failed: ${err?.message || err}`);
    }

    const pretty = `+${result.number}`;
    const lines = [`📱 *${pretty}* — ${BAN_STATUS_TEXT[result.ban]}`];

    switch (result.ban) {
      case 'likely_banned': {
        const at = result.evidence?.wasActive?.at;
        if (at) lines.push(`Last confirmed active: ${new Date(at).toUTCString()}`);
        break;
      }
      case 'banned':
        if (result.evidence?.probe?.reason) lines.push(`Server reason: ${result.evidence.probe.reason}`);
        break;
      default:
        break;
    }
    if (result.evidence?.probe?.verdict === 'throttled') {
      lines.push('⚠️ WhatsApp is rate-limiting checks — result based on local data only.');
    }
    if (result.evidence?.probe?.verdict === 'old_version') {
      lines.push(`⚠️ Probe UA outdated — bump TOKENLESS_UA in src/lib/bancheck.js (currently ${TOKENLESS_UA.split(' ')[0]}).`);
    }

    return result.ban === 'banned' || result.ban === 'likely_banned'
      ? m.reply.warn(lines.join('\n'))
      : m.reply.success(lines.join('\n'));
  },
};
