/**
 * pairdeny.js — SUPER OWNER ONLY: deny a pending pairing request
 * (.pairdeny <number>, alias .pdeny). If exactly one request is pending,
 * the number may be omitted. The requester gets a polite decline.
 */
import { withReactionStatus } from '../../lib/cosmetics.js';
import { peekPairRequest, removePairRequest, getPairRequests } from '../../core/sessionManager.js';
import { client } from '../../core/client.js';

export default {
  name: 'pairdeny',
  aliases: ['pdeny', 'denypair'],
  category: 'owner',
  description: 'SUPER OWNER — deny a pending .pair request. Usage: .pairdeny <number>',
  cooldown: 5000,
  permissions: { owner: true },
  execute: async ({ sock, m, args, prefix }) => {
    const p = prefix || '.';
    if (!(await m.isSuperOwner)) {
      console.warn('[CMD-DENY] pairdeny: sender is not in SUPER_OWNER_NUMBERS');
      return await m.reply.error(`*Super owner only.* Only the super owner can deny pairing requests.`);
    }

    let req = null;
    if (args[0]) {
      req = peekPairRequest(args[0]);
      if (!req) {
        return await m.reply.error(`*No pending request for that number.* See \`${p}pairrequests\`.`);
      }
    } else {
      const all = getPairRequests();
      if (all.length === 1) {
        req = all[0];
      } else if (all.length === 0) {
        return await m.reply.info(`*No pending pairing requests.*`, 'PAIR DENY');
      } else {
        return await m.reply.info(
          `*Several requests pending — pick one:*\n\n` +
          all.map(r => `\`${p}pairdeny ${r.phone}\` ← +${r.phone} (${r.name || 'unknown'})`).join('\n'),
          'PAIR DENY'
        );
      }
    }

    return await withReactionStatus(m, async () => {
      removePairRequest(req.phone);
      try {
        if (client.socket?.user) {
          await client.socket.sendMessage(req.dmJid, {
            text: `❌ Your pairing request for +${req.phone} was *denied* by the owner.`,
          });
        }
      } catch (_) {}
      return await m.reply.success(`✅ *Denied.* The request for +${req.phone} was removed and the requester notified.`);
    });
  },
};
