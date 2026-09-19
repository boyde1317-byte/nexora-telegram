/**
 * setchannel.js — owner control over the channel pill shown on menu cards.
 *
 *   .setchannel <...@newsletter>   → set the pill (JID from .channel info/list)
 *   .setchannel <name> <...@newsletter> → set with a custom display name
 *   .setchannel off                → remove the pill
 *
 * The pill is the small " forwarded from <channel> " banner at the top
 * of menu cards. It is captured automatically when you run
 * .channel create — this command exists for adopting an existing
 * channel (grab its JID via .channel info <link>).
 */
import { db } from '../../database/db.js';
import { isChannelJid } from '../../lib/menuContext.js';

export default {
  name: 'setchannel',
  aliases: [],
  category: 'owner',
  description: 'Sets/clears the channel pill on menu cards: .setchannel <...@newsletter> | off',
  permissions: { owner: true },
  cooldown: 3000,
  execute: async ({ m, args }) => {
    const sub = args[0]?.toLowerCase();

    if (sub === 'off') {
      db.setSettings({ channelId: undefined, channelName: undefined, channelPillOff: true });
      return await m.reply.success('Channel pill removed — no channel will be shown on cards or replies.');
    }

    if (!sub || !args.length) {
      const current = db.getSettings?.() || {};
      const cur = current.channelId
        ? `Current pill: *${current.channelName || current.channelId}*\n\`${current.channelId}\``
        : 'No channel pill set yet.';
      return await m.reply.info(
        `${cur}\n\n• Set: \`.setchannel <...@newsletter>\`\n• Custom name: \`.setchannel <name> <...@newsletter>\`\n• Remove: \`.setchannel off\`\n\nGrab a channel JID with \`.channel info <link>\` or \`.channel list\`.`,
        '📢 CHANNEL PILL',
      );
    }

    // .setchannel <name> <jid>
    let jid = null, name = null;
    for (let i = 0; i < args.length; i++) {
      if (isChannelJid(args[i])) { jid = args[i]; name = args.slice(0, i).join(' ') || null; }
    }
    if (!jid) {
      return await m.reply.warn('That does not look like a channel JID. Expected something like `123456789@newsletter` — get it via `.channel info <link>`.');
    }

    db.setSettings({ channelId: jid, channelName: name || jid.split('@')[0], channelPillOff: false });
    await m.react('✅');
    return await m.reply.success(`Menu cards will now show the pill: *${name || jid.split('@')[0]}*`);
  },
};
