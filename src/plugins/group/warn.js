/**
 * warn.js — Enhanced warning system with expiry and auto-actions.
 *
 * Owner/admin can warn users. After reaching the threshold (default 3),
 * the user is automatically removed from the group (if bot is admin).
 * Warnings expire after the configured time (default 24 hours).
 */
import { db } from '../../database/db.js';
import { config } from '../../../config/index.js';
import { asciiBuilder } from '../../ui/asciiBuilder.js';
import { toSmallcaps } from '../../lib/smallcaps.js';
import { formatDuration } from '../../lib/utils.js';

export default {
  name: 'warn',
  aliases: ['warning'],
  category: 'group',
  description: 'Warn a user. 3 warnings = auto-removal. Usage: .warn @user [reason]',
  cooldown: 2000,
  permissions: { admin: true, owner: true },
  execute: async ({ sock, m, args, prefix }) => {
    const p = prefix || '.';

    if (!m.isGroup) {
      return await m.reply.error('This command only works in groups.');
    }

    // Get target: mentioned user or replied-to user
    let targetJid = null;
    if (m.mentioned && m.mentioned.length > 0) {
      targetJid = m.mentioned[0];
    } else if (m.quoted) {
      targetJid = m.quoted.sender;
    }

    if (!targetJid) {
      return await m.reply.error(
        `Usage: \`${p}warn @user [reason]\`\nOr reply to a message with \`${p}warn [reason]\``
      );
    }

    // Can't warn yourself or the bot
    if (targetJid === m.sender) {
      return await m.reply.error("You can't warn yourself.");
    }
    if (targetJid === sock.user?.id) {
      return await m.reply.error("You can't warn the bot.");
    }

    const reason = args.slice(m.mentioned?.length || 0).join(' ').trim() || 'No reason provided';
    const groupData = db.getGroup(m.from);
    const warnings = groupData.warnings || {};
    const userWarns = (warnings[targetJid] || 0) + 1;

    // Check for warn expiry
    const warnTimes = groupData.warnTimes || {};
    const lastWarn = warnTimes[targetJid] || 0;
    const warnExpiry = config.moderation?.warnExpiryMs || 86400000;

    if (lastWarn && Date.now() - lastWarn > warnExpiry && userWarns > 1) {
      // Previous warnings expired, reset
      warnings[targetJid] = 1;
    } else {
      warnings[targetJid] = userWarns;
    }
    warnTimes[targetJid] = Date.now();

    db.setGroup(m.from, { warnings, warnTimes });

    const targetNum = targetJid.split('@')[0].split(':')[0];
    const threshold = config.moderation?.antilinkWarnThreshold || 3;

    if (userWarns >= threshold) {
      // Try to remove user
      try {
        await sock.groupParticipantsUpdate(m.from, [targetJid], 'remove');
        warnings[targetJid] = 0;
        db.setGroup(m.from, { warnings });
        return await m.reply(
          asciiBuilder.box('Warning — Removal', [
            `🚫 @${targetNum} has been removed`,
            `▸ Warnings: ${threshold}/${threshold}`,
            `▸ Reason: ${reason}`,
          ]),
          { mentions: [targetJid] }
        );
      } catch (_) {
        return await m.reply(
          asciiBuilder.box('Warning', [
            `⚠️ @${targetNum} reached ${userWarns}/${threshold} warnings`,
            `▸ Reason: ${reason}`,
            `▸ Cannot remove — bot is not a group admin`,
          ]),
          { mentions: [targetJid] }
        );
      }
    }

    return await m.reply(
      asciiBuilder.box('Warning', [
        `⚠️ @${targetNum} has been warned`,
        `▸ Warning ${userWarns}/${threshold}`,
        `▸ Reason: ${reason}`,
        `▸ Expires in: ${formatDuration(warnExpiry)}`,
      ]),
      { mentions: [targetJid] }
    );
  },
};
