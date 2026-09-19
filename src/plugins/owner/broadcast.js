/**
 * @file src/plugins/owner/broadcast.js
 *
 * .broadcast (bc) — owner-only announcement to every group the bot
 * is in. `sock.groupFetchAllParticipating()` gives the full roster.
 *
 *   .broadcast Hello groups! ✦     → announce to all groups
 *   .bc count                      → how many groups would receive it
 *
 * Sends ride plain sock.sendMessage (tracked by outgoingCache for
 * .delall sweeps) with the brand contextInfo: externalAdReply banner +
 * channel pill — same presentation as normal replies.
 *
 * Pacing: 1.5s per group. WhatsApp's spam heuristics flag broadcast
 * bursts hard, and a kill here can cascade into rate limits for ALL
 * messages, so this is deliberately slow. No retry loop — failures
 * are counted, not retried.
 */
import { config } from '../../../config/index.js';
import { buildEnrichedContextInfo } from '../../lib/enrichContext.js';
import { withChannelPill } from '../../lib/menuContext.js';

const PACE_MS    = 1500;
const MAX_CHARS  = 700;

export default {
  name: 'broadcast',
  aliases: ['bc'],
  category: 'owner',
  description: 'Announce to all groups. Usage: .broadcast <text> | .broadcast count',
  cooldown: 10000,
  permissions: { owner: true },
  execute: async ({ sock, m, args }) => {
    const sub = (args[0] || '').toLowerCase();

    let groups = {};
    try {
      groups = await sock.groupFetchAllParticipating();
    } catch (err) {
      return await m.reply.error(`Could not fetch group list: ${err.message}`);
    }
    const jids = Object.keys(groups || {});

    // ── .bc count — dry run ────────────────────────────────────────────
    if (sub === 'count') {
      return await m.reply.info(`I am in *${jids.length}* group${jids.length !== 1 ? 's' : ''}.`);
    }

    const text = args.join(' ').trim();
    if (!text) {
      return await m.reply.error('Give me the announcement text: *.broadcast <text>* (or *.broadcast count* for a dry run).');
    }
    if (text.length > MAX_CHARS) {
      return await m.reply.error(`Announcement too long — max ${MAX_CHARS} chars (currently ${text.length}).`);
    }

    await m.reply(`📣 Broadcasting to *${jids.length}* group${jids.length !== 1 ? 's' : ''}…`);

    // Brand presentation: adReply banner + channel pill, same as replies
    let contextInfo;
    try {
      contextInfo = withChannelPill(await buildEnrichedContextInfo());
    } catch (_) { contextInfo = undefined; }

    let sent = 0;
    for (const jid of jids) {
      try {
        await sock.sendMessage(jid, {
          text: `📣 *${config.botName || 'NEXORA'} Announcement*\n\n${text}`,
          ...(contextInfo ? { contextInfo } : {}),
        });
        sent++;
      } catch (_) { /* dead group / rate-limited — count, don't retry */ }
      await new Promise(r => setTimeout(r, PACE_MS));
    }

    return await m.reply.success(`📣 Delivered to *${sent}/${jids.length}* groups.`);
  },
};
