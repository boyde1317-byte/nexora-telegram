/**
 * remind.js — persisted reminders with a rich confirmation card.
 *
 * .remind 30m Check the oven     → reminder in 30 minutes
 * .remind 2h30m Call mom         → compound durations
 * .remind list                   → richTableCard of pending reminders
 * .remind cancel r1abc           → cancel by id
 * .remind clear                  → drop all your reminders
 *
 * Reminders survive restarts (boot sweep delivers anything missed while
 * offline, up to 24h late). The confirmation card carries a native
 * cta_reminder CTA so the user can ALSO pin the reminder to their
 * device clock — experimental, gated behind NEXORA_REMINDER_CTA=1
 * (experimentalCta: true — device-test before enabling).
 */
import { addReminder, listReminders, remove, clearReminders, formatDuration } from '../../lib/reminderService.js';
import { richTableCard, mixedCard } from '../../lib/interactiveKit.js';

// Compound duration: "2h30m", "1d", "45s", "10m"
const DUR_RE = /^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i;
const UNIT_MS = { d: 86400000, h: 3600000, m: 60000, s: 1000 };

function parseDuration(str) {
  const m = str.match(/^((?:\d+[dhms])+)$/i);
  if (!m) return 0;
  let ms = 0;
  for (const part of str.toLowerCase().match(/\d+[dhms]/g) || []) {
    ms += parseInt(part) * UNIT_MS[part.slice(-1)];
  }
  return ms;
}

export default {
  name: 'remind',
  aliases: ['reminder', 'remindme'],
  category: 'utility',
  description: 'Persistent reminders: .remind <30m|2h|1d> <text> • .remind list/cancel/clear',
  cooldown: 3000,
  execute: async ({ sock, m, args }) => {
    const sub = args[0]?.toLowerCase();

    // ── list ────────────────────────────────────────────────────────────
    if (sub === 'list') {
      const list = listReminders(m.from);
      if (!list.length) return await m.reply.info('No active reminders. Set one with `.remind 30m <text>`.', '⏰ REMINDERS');
      await m.react('⏰');
      return await richTableCard(sock, m.from, {
        title: `⏰ YOUR REMINDERS (${list.length})`,
        headers: ['#', 'Reminder', 'Fires in', 'ID'],
        rows: list.map((r, i) => [String(i + 1), r.text.length > 40 ? r.text.slice(0, 37) + '…' : r.text, formatDuration(r.triggerAt - Date.now()), r.id]),
        footer: 'Cancel with .remind cancel <ID>',
      }, { quoted: m });
    }

    // ── cancel / clear ──────────────────────────────────────────────────
    if (sub === 'cancel') {
      const id = args[1];
      if (!id) return await m.reply.warn('Usage: `.remind cancel <ID>` — find IDs via `.remind list`.');
      return remove(id, m.from)
        ? await m.reply.success(`Reminder \`${id}\` cancelled.`)
        : await m.reply.warn(`No reminder \`${id}\` under your name.`);
    }
    if (sub === 'clear') {
      const n = clearReminders(m.from);
      return n
        ? await m.reply.success(`${n} reminder${n > 1 ? 's' : ''} cleared.`)
        : await m.reply.info('You had no active reminders.');
    }

    // ── set ─────────────────────────────────────────────────────────────
    if (!args.length) {
      return await m.reply.info(
        '*Usage*\n' +
        '• `.remind 30m Check the oven`\n' +
        '• `.remind 2h30m Call mom`\n' +
        '• `.remind 1d Submit the report`\n\n' +
        '*Manage*\n' +
        '• `.remind list` — pending reminders\n' +
        '• `.remind cancel <ID>`\n' +
        '• `.remind clear`\n\n' +
        '_Reminders survive bot restarts; anything that comes due while I am offline is delivered up to 24h late._',
        '⏰ REMIND',
      );
    }

    const durStr = args[0];
    const ms = parseDuration(durStr);
    if (!ms) return await m.reply.warn('Start with a duration like `30m`, `2h`, `1d` — then the text. Example: `.remind 15m Stretch`.');
    const text = args.slice(1).join(' ').trim();
    if (!text) return await m.reply.warn('Add a message: `.remind 15m Stretch`.');

    const res = addReminder({ jid: m.from, text, triggerAt: Date.now() + ms });
    if (res.error) return await m.reply.warn(res.error);
    const { reminder } = res;
    await m.react('⏰');

    // Rich confirmation card. The native cta_reminder CTA (pins the
    // reminder to the user's device clock) is EXPERIMENTAL — gated behind
    // NEXORA_REMINDER_CTA=1 until device-verified (experimentalCta: true).
    const buttons = [
      { kind: 'action', label: '📋 All reminders', cmd: '.remind list' },
      { kind: 'action', label: '❌ Cancel this', cmd: `.remind cancel ${reminder.id}` },
    ];
    if (process.env.NEXORA_REMINDER_CTA === '1') {
      buttons.push({ kind: 'reminder', label: '🔔 Also set on my device', reminder: { id: reminder.id, title: text.slice(0, 60), time: new Date(reminder.triggerAt).toISOString() } });
    }

    const cardText =
      `⏰ *REMINDER SET*\n\n` +
      `❯ *Message:* ${text}\n` +
      `❯ *Fires in:* ${formatDuration(ms)}\n` +
      `❯ *ID:* \`${reminder.id}\`\n\n` +
      `_I'll ping you here when it's time — even if I restart in between._`;

    return await mixedCard(sock, m.from, { text: cardText, footer: 'NEXORA Reminders' }, buttons, { quoted: m });
  },
};
