/**
 * warns.js — view / forgive protection-suite strikes.
 *
 * .warns                 → richTableCard of everyone carrying strikes
 * .warns @user           → one member's strike count
 * .warns reset @user     → forgive (clear their strikes)
 *
 * These are the ANTI-GUARD strikes (antilink/antisticker/antispam/
 * antiword/antiviewonce/antidelete — db.getGroup().warnings, shared 3-
 * strike pool), not the .warn command's formal warnings.
 */
import { db } from '../../database/db.js';
import { richTableCard } from '../../lib/interactiveKit.js';

function normalizeJid(target) {
  let jid = String(target || '').trim();
  if (!jid) return null;
  if (!jid.includes('@')) jid = jid.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
  return jid.split(':')[0]; // strip linked-device suffix
}

const label = jid => '+' + String(jid).split('@')[0].split(':')[0];

export default {
  name: 'warns',
  category: 'group',
  description: 'View or forgive protection strikes: .warns [@user] • .warns reset @user',
  permissions: { groupOnly: true, admin: true, owner: true },
  cooldown: 3000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    const groupData = db.getGroup(m.from);
    const warns = { ...(groupData.warnings || {}) };
    const reset = args[0]?.toLowerCase() === 'reset';
    const target = m.mentioned?.[0] || m.quoted?.sender || (reset ? args[1] : args[0]);

    // ── forgive ────────────────────────────────────────────────────────
    if (reset) {
      const jid = normalizeJid(target);
      if (!jid) return await m.reply.warn(`Usage: \`${p}warns reset @user\` — or reply to their message.`);
      if (!warns[jid]) return await m.reply.info(`*${label(jid)}* carries no protection strikes.`);
      delete warns[jid];
      db.setGroup(m.from, { warnings: warns });
      return await m.reply.success(`🕊️ Forgiven — cleared *${label(jid)}*'s protection strikes.`);
    }

    // ── single member ──────────────────────────────────────────────────
    if (target) {
      const jid = normalizeJid(target);
      const count = warns[jid] ?? 0;
      if (!count) return await m.reply.info(`*${label(jid)}* carries no protection strikes. Sparkling record.`);
      return await m.reply.info(
        `*${label(jid)}* is on strike *${count}/3*.\n\nAt 3 the anti-abuse suite removes them. ` +
        `Forgive with \`${p}warns reset ${label(jid)}\`.`,
        '⚠️ PROTECTION STRIKES',
      );
    }

    // ── group overview ─────────────────────────────────────────────────
    const entries = Object.entries(warns).filter(([, c]) => c > 0);
    if (!entries.length) return await m.reply.info('Nobody in this group carries protection strikes. ✦', '⚠️ PROTECTION STRIKES');

    await m.react('⚠️');
    return await richTableCard(sock, m.from, {
      title: `⚠️ PROTECTION STRIKES (${entries.length})`,
      headers: ['#', 'Member', 'Strikes'],
      rows: entries
        .sort((a, b) => b[1] - a[1])
        .map(([jid, c], i) => [String(i + 1), label(jid), `${c}/3`]),
      footer: `Forgive with ${p}warns reset @user`,
    }, { quoted: m });
  },
};
