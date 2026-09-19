/**
 * pairrequests.js — SUPER OWNER ONLY: list pending pairing requests
 * (.pairrequests, aliases .pairlist / .pairqueue). One pending request
 * renders as an interactive Approve/Deny card; multiple render as a table.
 */
import { richTableCard } from '../../lib/interactiveKit.js';
import { actionCard } from '../../lib/interactiveKit.js';
import { getPairRequests } from '../../core/sessionManager.js';

export default {
  name: 'pairrequests',
  aliases: ['pairlist', 'pairqueue'],
  category: 'owner',
  description: 'SUPER OWNER — list pending pairing requests. Usage: .pairrequests',
  cooldown: 5000,
  permissions: { owner: true },
  execute: async ({ sock, m, prefix }) => {
    const p = prefix || '.';
    if (!(await m.isSuperOwner)) {
      console.warn('[CMD-DENY] pairrequests: sender is not in SUPER_OWNER_NUMBERS');
      return await m.reply.error(`*Super owner only.*`);
    }

    const all = getPairRequests();
    if (!all.length) {
      return await m.reply.info(`*No pending pairing requests.*\n\nAnyone can file one with \`${p}pair <number>\`.`, 'PAIR REQUESTS');
    }

    // Single request → straight to the interactive card.
    if (all.length === 1) {
      const r = all[0];
      try {
        return await actionCard(sock, m.from, {
          text: `📶 *1 PENDING PAIRING REQUEST*\n\nNumber: +${r.phone}\nRequested by: ${r.name || 'unknown'}\n\nApproving opens the pairing channel — the code goes to the requester's DM.`,
          footer: 'Requests expire after ~15 minutes',
        }, [
          { label: '✅ Approve', cmd: `.pairapprove ${r.phone}` },
          { label: '❌ Deny',    cmd: `.pairdeny ${r.phone}` },
        ], { quoted: m });
      } catch (err) {
        // fall through to the table below
      }
    }

    try {
      return await richTableCard(sock, m.from, {
        title: `📶 PENDING PAIRING REQUESTS (${all.length})`,
        headers: ['Number', 'Requested by', 'Age'],
        rows: all.map(r => [
          `+${r.phone}`,
          r.name || 'unknown',
          `${Math.max(1, Math.round((Date.now() - r.ts) / 60000))}m ago`,
        ]),
        footer: `.pairapprove <number> / .pairdeny <number> • expire after ~15m`,
      }, { quoted: m });
    } catch (err) {
      return await m.reply(
        `*PENDING PAIRING REQUESTS (${all.length})*\n\n` +
        all.map(r => `+${r.phone} — ${r.name || 'unknown'} (filed ${Math.max(1, Math.round((Date.now() - r.ts) / 60000))}m ago)`).join('\n') +
        `\n\n\`${p}pairapprove <number>\` or \`${p}pairdeny <number>\` to act.`
      );
    }
  },
};
