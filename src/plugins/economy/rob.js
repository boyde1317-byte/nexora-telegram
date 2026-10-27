/**
 * @file src/plugins/economy/rob.js
 * .rob @user — steal a cut of another player's coins. Success odds scale
 * with your level vs theirs; failing costs a fine + jail time. The
 * classic social risk/reward loop of WhatsApp economies.
 */

import { resolveDisplayIdentity, mentionChip } from '../../lib/identity.js';
import { db } from '../../database/db.js';
import { withUserLock } from '../../economy/leveling.js';
import { commitAction } from '../../economy/actions.js';
import { withReactionStatus } from '../../lib/cosmetics.js';
import { richTableCard } from '../../lib/interactiveKit.js';

const COOLDOWN_MS = 10 * 60 * 1000;
const MIN_TARGET_COINS = 200;

export default {
  name: 'rob',
  aliases: ['steal', 'mug'],
  category: 'economy',
  description: 'Rob another user! 10min cooldown. Fail = fine + jail.',
  cooldown: 4000,
  execute: async ({ m, sock, prefix }) => {
    const p = prefix || '.';
    await withReactionStatus(m, async () => {
      try {
        const target = m.msg?.contextInfo?.mentionedJid?.[0]
          || (m.args?.[0] && m.args[0].startsWith('@') ? m.args[0].slice(1) + '@s.whatsapp.net' : null)
          || m.msg?.contextInfo?.participant;
        if (!target || target === m.sender) {
          return await m.reply.warn(`Tag someone to rob: *${p}rob @user*`, 'ROB');
        }
        if (db.getUser(target).banned) return await m.reply.warn('You can\'t rob a banned user.', 'ROB');

        await withUserLock(m.sender, async () => {
          await withUserLock(target, async () => {
            const u = db.getUser(m.sender);
            const t = db.getUser(target);
            const now = Date.now();

            // ── sender gates ────────────────────────────────────────────────
            if (u.jailUntil && now < u.jailUntil) {
              return await m.reply.warn('🚔 You\'re in jail. Wait it out, criminal.', 'ROB');
            }
            if (u.lastRob && now - u.lastRob < COOLDOWN_MS) {
              const min = Math.ceil((COOLDOWN_MS - (now - u.lastRob)) / 60000);
              return await m.reply.warn(`Your tools are still warm. Try again in *${min} min*.`, 'ROB');
            }
            if (t.jailUntil && now < t.jailUntil) {
              return await m.reply.warn('🚔 They\'re in jail — nothing to steal but regrets.', 'ROB');
            }
            if ((t.coins ?? 0) < MIN_TARGET_COINS) {
              return await m.reply.warn(`They\'re too broke to rob (need ${MIN_TARGET_COINS}+ coins on hand).`, 'ROB');
            }

            // ── odds: 40% base, +/- 2% per level of difference (capped) ────
            const levelGap = Math.min(10, Math.max(-10, (u.level ?? 0) - (t.level ?? 0)));
            const chance = Math.min(0.8, Math.max(0.15, 0.40 + levelGap * 0.02));
            const success = Math.random() < chance;

            if (success) {
              const stealPct = 0.15 + Math.random() * 0.20; // 15–35%
              const stolen = Math.floor((t.coins ?? 0) * stealPct);
              const stats = {
                robs: (u.stats?.robs ?? 0) + 1,
                robWins: (u.stats?.robWins ?? 0) + 1,
              };
              const { result, lines } = commitAction(m.sender, {
                coinsDelta: stolen,
                xp: 15,
                stats,
                quest: 'robWins',
                extra: { lastRob: now },
              });
              // victim pays
              db.setUser(target, {
                coins: Math.max(0, (t.coins ?? 0) - stolen),
                stats: { ...(t.stats ?? {}), robbedTimes: (t.stats?.robbedTimes ?? 0) + 1 },
              });

              try {
                await richTableCard(sock, m.from, {
                  title: '🥷 ROBBERY SUCCESSFUL',
                  headers: ['', ''],
                  rows: [
                    ['Thief', 'You'],
                    ['Haul', `🪙 +${stolen.toLocaleString()} (now ${(result.after.coins ?? 0).toLocaleString()})`],
                    ['Victim', 'left counting their losses...'],
                  ],
                  footer: lines.length ? lines.join('\n') : '💸 Victim got paid dust. Cooldown: 10 min.',
                  buttons: [
                    { label: 'Rob again (in 10m)', cmd: `${p}rob` },
                    { label: 'Balance', cmd: `${p}balance` },
                  ],
                }, { quoted: m, mentions: [target] });
              } catch (_) {
                await m.reply(`🥷 *You stole ${stolen.toLocaleString()} coins!*${lines.length ? '\n' + lines.join('\n') : ''}`);
              }
              // tell the victim with a mention
              const robChip = await mentionChip(sock, target, m.from);
              await sock.sendMessage(m.from, {
                text: `${robChip.label} — you were *robbed* of 🪙 ${stolen.toLocaleString()} coins! 😱`,
                mentions: [robChip.mentionJid],
              }, { quoted: m }).catch(() => {});
            } else {
              // caught: fine + jail
              const fine = Math.min((u.coins ?? 0), 100 + Math.floor(Math.random() * 200));
              const jailMin = 2 + Math.floor(Math.random() * 4); // 2–5 min
              const stats = {
                robs: (u.stats?.robs ?? 0) + 1,
                caught: (u.stats?.caught ?? 0) + 1,
                jails: (u.stats?.jails ?? 0) + 1,
              };
              commitAction(m.sender, {
                coinsDelta: -fine,
                stats,
                extra: { lastRob: now, jailUntil: now + jailMin * 60000 },
              });
              await m.reply.warn(
                `🚨 *You got caught!*${fine > 0 ? `\n💸 Fine: ${fine.toLocaleString()} coins` : ''}\n🚔 Jail: *${jailMin} minutes*\n\nBetter luck next time, rookie.`,
                'ROB FAILED'
              );
            }
          });
        });
      } catch (e) {
        if (String(e?.message).includes('transaction')) return await m.reply.warn(String(e.message), 'ROB');
        await m.reply.error(`Rob error: ${e.message}`);
      }
    });
  },
};
