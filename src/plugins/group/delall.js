/**
 * @file src/plugins/group/delall.js
 *
 * .delall — sweep every message the bot has recently sent in the
 * current chat (group or DM). Powered by src/lib/outgoingCache.js,
 * which transparently records every outgoing id (sendMessage returns
 * + relayMessage messageId, so rich cards and menus count too).
 *
 * Gates match .purge: group admins / owner. The cache is capped and
 * in-memory, so this is recent-message housekeeping — messages from
 * before the last restart aren't known. Deletes are paced (~180ms)
 * to avoid tripping server-side rate limits; sweep capped at 200.
 */
import { getOutgoingKeys, dropOutgoing } from '../../lib/outgoingCache.js';

const MAX_SWEEP = 200;
const PACE_MS   = 180;

export default {
  name: 'delall',
  aliases: ['clearall', 'sweep', 'clearchat'],
  category: 'group',
  description: 'Delete every message the bot recently sent in this chat',
  cooldown: 10000,
  permissions: { admin: true, owner: true },
  execute: async ({ sock, m }) => {
    // Snapshot BEFORE the heads-up reply — otherwise the heads-up sweeps itself
    const keys = getOutgoingKeys(m.from);
    if (!keys.length) {
      return await m.reply.error(
        "Nothing to sweep — I have no recent sent messages cached for this chat."
      );
    }

    const batch = keys.slice(-MAX_SWEEP);
    await m.reply(`🧹 Sweeping my last *${batch.length}* message${batch.length !== 1 ? 's' : ''}…`);

    let deleted = 0;
    const gone = [];
    for (const key of batch) {
      try {
        await sock.sendMessage(m.from, { delete: key });
        deleted++;
        gone.push(key.id);
      } catch (_) { /* too old / already gone — skip */ }
      await new Promise(r => setTimeout(r, PACE_MS));
    }
    dropOutgoing(m.from, gone);

    const missed = batch.length - deleted;
    const summary = missed > 0
      ? `🧹 Swept *${deleted}* of *${batch.length}* — ${missed} were too old or already gone.`
      : `🧹 Swept all *${deleted}* messages. Spotless. ✦`;
    await m.reply(summary);
  },
};
