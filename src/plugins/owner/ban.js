/**
 * ban.js — Ban a user from using the bot.
 * Owner-only. Banned users are silently blocked from all commands.
 */
import { db } from '../../database/db.js';
import { asciiBuilder } from '../../ui/asciiBuilder.js';
import { buildEnrichedContextInfo } from '../../lib/enrichContext.js';

export default {
  name: 'ban',
  aliases: ['banuser'],
  category: 'owner',
  description: 'Ban a user from using the bot. Usage: .ban @user [reason]',
  cooldown: 2000,
  permissions: { owner: true },
  execute: async ({ m, args }) => {
    let targetJid = null;
    if (m.mentioned?.length > 0) targetJid = m.mentioned[0];
    else if (m.quoted) targetJid = m.quoted.sender;

    if (!targetJid) {
      return await m.reply.error('Usage: `.ban @user [reason]` — or reply to a message with `.ban [reason]`');
    }
    if (targetJid === m.sender) return await m.reply.error("You can't ban yourself.");

    const reason = args.slice(m.mentioned?.length || 0).join(' ').trim() || 'No reason provided';
    const user = db.getUser(targetJid);
    if (user.banned) return await m.reply.error('This user is already banned.');

    db.setUser(targetJid, { banned: true, banReason: reason });
    const targetNum = targetJid.split('@')[0].split(':')[0];
    return await m.reply(asciiBuilder.box('User Banned', [
      `🚫 @${targetNum} has been banned`,
      `▸ Reason: ${reason}`,
    ]), { mentions: [targetJid], contextInfo: buildEnrichedContextInfo() });
  },
};
