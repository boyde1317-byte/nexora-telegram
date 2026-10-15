/**
 * @file src/plugins/fun/confess.js
 * .confess <text> — anonymous confessions to the group. The caller's
 * original command message is deleted (needs bot admin) and the bot posts
 * the confession as a numbered card. If the delete fails the user is
 * warned that anonymity isn't guaranteed.
 */

import { db } from '../../database/db.js';
import { commitAction } from '../../economy/actions.js';
import { withReactionStatus } from '../../lib/cosmetics.js';
import { actionCard } from '../../lib/interactiveKit.js';

const FOOTER = 'Anonymous via .confess — NEXORA never reveals senders.';

export default {
  name: 'confess',
  aliases: ['confession', 'anonconfess'],
  category: 'fun',
  description: 'Send an anonymous confession to the group. Use: .confess <your confession>',
  cooldown: 10000,
  groupOnly: true,
  execute: async ({ m, sock, prefix }) => {
    const p = prefix || '.';
    await withReactionStatus(m, async () => {
      try {
        const text = (m.args ?? []).join(' ').trim();
        if (!text) return await m.reply.warn(`Say it in your chest: *${p}confess <text>*`, 'CONFESSION');
        if (text.length > 500) return await m.reply.warn('Keep it under 500 characters — even secrets should be concise.', 'CONFESSION');

        // numbered per group
        const g = db.getGroup(m.from);
        const num = (g.confessCount ?? 0) + 1;

        // try to delete the caller's command for anonymity
        let anonymous = true;
        try {
          await sock.sendMessage(m.from, { delete: m.key });
        } catch {
          anonymous = false;
        }

        // post the confession as the bot
        const caption =
          `💌 *CONFESSION #${num}*\n\n` +
          `_"${text}"_\n\n` +
          (anonymous
            ? '— *anonymous*\n'
            : '— _anonymity failed (make me admin to delete your message)_\n') +
          `\n${FOOTER}`;

        try {
          await actionCard(sock, m.from, {
            text: caption,
            footer: FOOTER,
          }, [
            { label: 'Send your own', cmd: `${p}confess` },
            { label: 'Ship meter', cmd: `${p}ship` },
          ], { quoted: undefined });
        } catch (_) {
          await sock.sendMessage(m.from, { text: caption }).catch(() => {});
        }

        // bookkeeping
        db.setGroup(m.from, { ...g, confessCount: num });
        const u = db.getUser(m.sender);
        const stats = { confesses: (u.stats?.confesses ?? 0) + 1 };
        const { lines } = commitAction(m.sender, { coinsDelta: 10, xp: 5, stats });

        // achievement toasts (sent privately so the sender stays anonymous)
        if (lines.length) {
          for (const line of lines) {
            await sock.sendMessage(m.sender, { text: line }).catch(() => {});
          }
        }
      } catch (e) {
        await m.reply.error(`Confess error: ${e.message}`);
      }
    });
  },
};
