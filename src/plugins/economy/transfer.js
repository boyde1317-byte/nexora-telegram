/**
 * transfer.js — gift coins to another user.
 *
 * Reply to someone or @mention them: .transfer <amount> [@user]
 * Single cute card, balance checks, and a thank-you nudge on the
 * receiving side of the same message (one message, both see it).
 */
import { withReactionStatus } from '../../lib/cosmetics.js';
import { withUserLock } from '../../economy/leveling.js';
import { actionCard } from '../../lib/interactiveKit.js';
import { resolveDisplayIdentity } from '../../lib/identity.js';

export default {
  name: 'transfer',
  aliases: ['gift', 'pay', 'sendcoins'],
  category: 'economy',
  description: 'Send coins to someone. .transfer <amount> while replying to them or @mentioning them.',
  cooldown: 5000,
  execute: async ({ m, sock, db, prefix, args }) => {
    const p = prefix || '.';
    await withReactionStatus(m, async () => {
      // Resolve the target: reply > mention
      let targetJid = null;
      if (m.quoted?.sender) targetJid = m.quoted.sender;
      else if (m.msg?.contextInfo?.mentionedJid?.length) targetJid = m.msg.contextInfo.mentionedJid[0];

      if (!targetJid) {
        return await m.reply(
          `🎁 *TRANSFER*\n\nUsage: \`${p}transfer <amount>\` while replying to someone, or \`${p}transfer 100 @user\``
        );
      }
      if (targetJid === m.sender) {
        return await m.reply('🎁 You can\'t gift yourself... but the thought is sweet.');
      }

      const amount = Math.floor(Number(args?.[0]));
      if (!Number.isFinite(amount) || amount <= 0) {
        return await m.reply(`How much? Try \`${p}transfer 100\``);
      }

      await withUserLock(m.sender, async () => {
        const me = db.getUser(m.sender);
        if ((me.coins ?? 0) < amount) {
          return await m.reply(`Not enough coins! You have *${(me.coins ?? 0).toLocaleString()}*, tried to send *${amount.toLocaleString()}*.`);
        }

        await withUserLock(targetJid, async () => {
          const them = db.getUser(targetJid);
          db.setUser(m.sender, { coins: (me.coins ?? 0) - amount });
          db.setUser(targetJid, { coins: (them.coins ?? 0) + amount });
        });

        const { label } = await resolveDisplayIdentity(sock, targetJid);
        const myNew = (me.coins ?? 0) - amount;

        const lines = [
          '✧･ﾟ: *GIFT SENT* :･ﾟ✧',
          '',
          `🪙 *${amount.toLocaleString()}* coins → 👤 ${label}`,
          '',
          `⚖️ Your wallet: *${myNew.toLocaleString()}* coins`,
          '_ generosity looks good on you ✨_',
        ];

        try {
          return await actionCard(sock, m.from, {
            text: lines.join('\n'),
            footer: 'NEXORA • Transfer',
          }, [
            { label: '⚖️ Balance',    cmd: `${p}balance` },
            { label: '👤 Profile',   cmd: `${p}me` },
            { label: '💼 Work',      cmd: `${p}work` },
          ], { quoted: m });
        } catch (_) {
          return await m.reply(lines.join('\n'));
        }
      });
    });
  },
};
