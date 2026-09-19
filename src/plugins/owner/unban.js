/**
 * unban.js — Unban a user, restoring access to commands.
 */
import { db } from '../../database/db.js';
import { asciiBuilder } from '../../ui/asciiBuilder.js';
import { buildEnrichedContextInfo } from '../../lib/enrichContext.js';

export default {
  name: 'unban',
  aliases: ['pardon'],
  category: 'owner',
  description: 'Unban a user. Usage: .unban @user',
  cooldown: 2000,
  permissions: { owner: true },
  execute: async ({ m }) => {
    let targetJid = null;
    if (m.mentioned?.length > 0) targetJid = m.mentioned[0];
    else if (m.quoted) targetJid = m.quoted.sender;

    if (!targetJid) return await m.reply.error('Usage: `.unban @user` — or reply to a user\'s message');

    const user = db.getUser(targetJid);
    if (!user.banned) return await m.reply.error('This user is not banned.');

    db.setUser(targetJid, { banned: false, banReason: null });
    const targetNum = targetJid.split('@')[0].split(':')[0];
    return await m.reply(asciiBuilder.box('User Unbanned', [
      `✅ @${targetNum} has been unbanned`,
      `▸ Access restored`,
    ]), { mentions: [targetJid], contextInfo: buildEnrichedContextInfo() });
  },
};
