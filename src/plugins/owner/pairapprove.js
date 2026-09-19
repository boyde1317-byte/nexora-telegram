/**
 * pairapprove.js — SUPER OWNER ONLY: approve a pending pairing request
 * (.pairapprove <number>, alias .papprove). If exactly one request is
 * pending, the number may be omitted.
 *
 * Approving opens the pairing channel — the code lands in the requester's
 * DM (never in a group), and the super owner gets the linked confirmation.
 */
import { withReactionStatus } from '../../lib/cosmetics.js';
import { pairSession, peekPairRequest, removePairRequest, getPairRequests } from '../../core/sessionManager.js';
import { client } from '../../core/client.js';

export default {
  name: 'pairapprove',
  aliases: ['papprove', 'approvepair'],
  category: 'owner',
  description: 'SUPER OWNER — approve a pending .pair request. Usage: .pairapprove <number>',
  cooldown: 5000,
  permissions: { owner: true },
  execute: async ({ sock, m, args, prefix }) => {
    const p = prefix || '.';
    if (!(await m.isSuperOwner)) {
      console.warn('[CMD-DENY] pairapprove: sender is not in SUPER_OWNER_NUMBERS');
      return await m.reply.error(
        `*Super owner only.* Only ${p ? '' : ''}the super owner can approve pairing requests.`
      );
    }

    // Resolve the target request: by number, or the sole pending one.
    let req = null;
    if (args[0]) {
      req = peekPairRequest(args[0]);
      if (!req) {
        return await m.reply.error(
          `*No pending request for that number.* See \`${p}pairrequests\` for the queue.`
        );
      }
    } else {
      const all = getPairRequests();
      if (all.length === 1) {
        req = all[0];
      } else if (all.length === 0) {
        return await m.reply.info(`*No pending pairing requests.*`, 'PAIR APPROVE');
      } else {
        return await m.reply.info(
          `*Several requests pending — pick one:*\n\n` +
          all.map(r => `\`${p}pairapprove ${r.phone}\` ← +${r.phone} (${r.name || 'unknown'})`).join('\n'),
          'PAIR APPROVE'
        );
      }
    }

    return await withReactionStatus(m, async () => {
      try {
        // The pairing code goes to the requester's DM (stored at request time).
        await pairSession(req.phone, { notifyJid: req.dmJid });
        removePairRequest(req.phone);
        console.log(`[SESSION] +${req.phone} request approved by super owner — pairing code sent to ${req.dmJid}`);

        // Tell the requester the good news (code follows separately).
        try {
          if (client.socket?.user) {
            await client.socket.sendMessage(req.dmJid, {
              text: `✅ *Your pairing request for +${req.phone} was APPROVED!*\n\nThe pairing code arrives next — enter it on that phone: WhatsApp → Settings → Linked Devices → Link a Device → *Link with phone number instead*. It is valid for a couple of minutes.`,
            });
          }
        } catch (_) {}

        return await m.reply.success(
          `✅ *Approved — pairing channel open for +${req.phone}.*\n\nThe code is being delivered to ${req.name || 'the requester'}'s DM. I'll confirm once the number links.`
        );
      } catch (err) {
        return await m.reply.error(
          `*Pairing failed after approval:* ${err.message || err}\n\nThe request was kept — try again with \`${p}pairapprove ${req.phone}\` or deny it with \`${p}pairdeny ${req.phone}\`.`
        );
      }
    });
  },
};
