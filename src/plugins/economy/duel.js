/**
 * @file src/plugins/economy/duel.js
 * .duel — PvP coin wagers with a challenge/accept flow and W/L records.
 *
 *  .duel @user 100     — challenge someone for 100 coins
 *  .duel accept        — accept the newest open challenge against you (reply or plain)
 *  .duel decline       — walk away, no shame
 *  .duel stats         — your record
 */

import { db } from '../../database/db.js';
import { createChallenge, getPendingChallenge, declineChallenge, resolveDuel } from '../../economy/duel.js';
import { getDisplayName } from '../../lib/displayName.js';
import { withReactionStatus } from '../../lib/cosmetics.js';

export default {
  name: 'duel',
  category: 'economy',
  description: 'Wager coins against a friend. Usage: .duel @user <amount> | .duel accept | .duel decline | .duel stats',
  cooldown: 5000,
  execute: async ({ m, sock, args, prefix }) => {
    const p = prefix || '.';
    const sub = (args[0] || '').toLowerCase();

    await withReactionStatus(m, async () => {
      // ── .duel stats ────────────────────────────────────────────────
      if (sub === 'stats' || sub === 'record') {
        const u = db.getUser(m.sender);
        const w = u.duelWins ?? 0, l = u.duelLosses ?? 0;
        const total = w + l;
        const pct = total > 0 ? Math.round((w / total) * 100) : 0;
        return await m.reply.info(
          `⚔️ *Your duel record*\n\nWins: *${w}* · Losses: *${l}*${total > 0 ? ` · Win rate: *${pct}%*` : ''}\n\n` +
          (total === 0 ? `_No duels yet — challenge someone with \`${p}duel @user <amount>\`_` : '_Sharpen those reflexes._'),
          'NEXORA • Duels');
      }

      // ── .duel decline ──────────────────────────────────────────────
      if (sub === 'decline' || sub === 'reject') {
        try {
          declineChallenge(m.from, m.sender);
          return await m.reply.success('🤝 Challenge declined. Dignity intact.');
        } catch (err) {
          return await m.reply.warn(err.message);
        }
      }

      // ── .duel accept ───────────────────────────────────────────────
      if (sub === 'accept' || sub === 'a') {
        // If they replied to the challenger, use that; else any open
        // challenge against them in this chat.
        const challengerJid = m.mentionedJid?.[0] || m.quoted?.sender;
        try {
          const verdict = await resolveDuel(m.from, challengerJid ?? '', m.sender);
          const winnerName = await getDisplayName(sock, verdict.winnerJid);
          const loserName = await getDisplayName(sock, verdict.loserJid);
          const winNum = verdict.winnerJid.split('@')[0].split(':')[0];
          return await m.reply.success(
            `⚔️ *DUEL SETTLED* ⚔️\n\n🪙 Pot: *${verdict.amount.toLocaleString()} coins*\n\n👑 *${winnerName}* takes it all!\n` +
            `Better luck next time, ${loserName}.\n\n🏅 Winner record: *${verdict.winnerRecord}*\n\n_Type \`${p}duel @${winNum} ${verdict.amount}\` to run it back._`);
        } catch (err) {
          if (!err.friendly) throw err;
          return await m.reply.warn(err.message);
        }
      }

      // ── .duel @user <amount> — issue a challenge ────────────────────
      const target = m.mentionedJid?.[0] || m.quoted?.sender;
      const amount = Math.floor(Number.parseInt(args.find(a => /^\d+$/.test(a)) ?? '', 10));

      if (!target) {
        return await m.reply.error(
          `Mention someone to duel!\n\n\`${p}duel @user 100\` — challenge them\n\`${p}duel accept\` — accept\n\`${p}duel decline\` — decline\n\`${p}duel stats\` — your record`,
          'NEXORA • Duels');
      }

      try {
        const u = db.getUser(m.sender);
        if ((u.coins ?? 0) < amount) {
          const err = new Error(`You can't cover your own bet — you have ${(u.coins ?? 0).toLocaleString()} coins.`);
          err.friendly = true;
          throw err;
        }
        createChallenge(m.from, m.sender, target, amount);
        const challengerName = m.pushName || 'Challenger';
        const targetNum = target.split('@')[0].split(':')[0];
        await sock.sendMessage(m.from, {
          text:
            `⚔️ *A DUEL IS DECLARED!* ⚔️\n\n*${challengerName}* challenges @${targetNum} to a coin duel!\n` +
            `🪙 Stakes: *${amount.toLocaleString()} coins* each\n\n@${targetNum}, the floor is yours —\n` +
            `✅ \`${p}duel accept\` — take the bet\n🏃 \`${p}duel decline\` — keep your coins\n\n_Opens 10 minutes. Winner takes the whole pot._`,
          mentions: [target],
        }, { quoted: m });
      } catch (err) {
        if (!err.friendly) throw err;
        await m.reply.warn(err.message);
      }
    });
  },
};
