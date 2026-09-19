/**
 * @file src/plugins/general/subscribe.js
 *
 * .subscribe — opt the current chat into the daily fact digest
 * (08:00, one message/day per chat). .subscribe status shows
 * state, .unsubscribe (also 'unsub', 'digest off') opts out.
 * Open to everyone — one fact a day is not a spam vector.
 */
import { db } from '../../database/db.js';
import { getSubscribers, fetchFact } from '../../lib/digestService.js';

export default {
  name: 'subscribe',
  aliases: ['unsubscribe', 'unsub', 'digest'],
  category: 'general',
  description: 'Daily fact digest. Usage: .subscribe | .subscribe status | .unsubscribe',
  cooldown: 5000,
  execute: async ({ m, args, body, prefix }) => {
    const raw = (body || '').trim().toLowerCase();
    const isUnsub = raw.startsWith(`${prefix}unsubscribe`) || raw.startsWith(`${prefix}unsub`)
      || (raw.startsWith(`${prefix}digest`) && raw.endsWith('off'));
    const sub = (args[0] || '').toLowerCase();
    const wantsOff = isUnsub || sub === 'off' || sub === 'remove';
    const wantsStatus = sub === 'status' || sub === 'info';

    const subscribers = getSubscribers();

    if (wantsOff) {
      if (!subscribers[m.from]) {
        return await m.reply.info('This chat is not subscribed to the digest.');
      }
      delete subscribers[m.from];
      try { db.save(); } catch (_) {}
      return await m.reply.success('Digest off. This chat will no longer get the daily fact.');
    }

    if (wantsStatus) {
      const on = !!subscribers[m.from];
      const next = on ? 'next digest: 08:00' : 'not subscribed';
      return await m.reply.info(`*Daily Digest*\nState: ${on ? '✅ subscribed' : '❌ off'}\n${next}`);
    }

    if (subscribers[m.from]) {
      return await m.reply.info('Already subscribed. Digest lands daily at 08:00. *.unsubscribe* to stop.');
    }

    // Sample the goods first — one fresh fact so they know what they signed up for
    const sample = await fetchFact();
    subscribers[m.from] = { lastSentDate: null, createdAt: Date.now() };
    try { db.save(); } catch (_) {}
    return await m.reply.success(
      `✅ Subscribed — daily fact at 08:00.\n\nHere is a taste:\n🧠 ${sample}\n\n*${prefix}unsubscribe* to stop.`
    );
  },
};
