/**
 * delsession.js — log out and remove an extra linked session.
 * .delsession <number> (aliases: .removesession, .unpair)
 */
import { withReactionStatus } from '../../lib/cosmetics.js';
import { removeSession, normalizeSessionPhone } from '../../core/sessionManager.js';

export default {
  name: 'delsession',
  aliases: ['removesession', 'unpair'],
  category: 'owner',
  description: 'Log out and remove an extra session. Usage: .delsession <number>',
  cooldown: 5000,
  permissions: { owner: true },
  execute: async ({ sock, m, args, prefix }) => {
    const p = prefix || '.';
    if (!args.length) {
      return await m.reply.info(
        `Usage: \`${p}delsession <number with country code>\` — removes that linked session and logs it out.`,
        'DELETE SESSION'
      );
    }

    // ── Tiered power ────────────────────────────────────────────────────
    // SUPER OWNER: can unpair ANY session. A paired session's own owner can
    // unpair ONLY their own session — never other people's.
    const target   = normalizeSessionPhone(args[0]);
    const isSuper  = await m.isSuperOwner;
    if (sock._nexoraExtraSession && !isSuper && target !== sock._nexoraSessionPhone) {
      console.warn(`[CMD-DENY] delsession: paired-session owner tried to unpair +${target}`);
      return await m.reply.error(
        `*Not allowed.* You can only remove your own session. Only the super owner can unpair other numbers.`
      );
    }

    return await withReactionStatus(m, async () => {
      try {
        const res = await removeSession(args[0]);
        return await m.reply.success(
          `*${res.message}*${res.wasOnline ? ' The number was online and has been disconnected.' : ''}`
        );
      } catch (err) {
        return await m.reply.error(`*Could not remove session:* ${err.message || err}`);
      }
    });
  },
};
