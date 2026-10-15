/**
 * @file src/plugins/economy/heist.js
 * .heist — group co-op bank job. One player starts a job, the crew joins
 * within 90s (max 6), then the vault cracks — or you all eat loss and jail.
 * More crew = better odds. The group-call energy of Nexora's economy.
 */

import { db } from '../../database/db.js';
import { withUserLock } from '../../economy/leveling.js';
import { commitAction } from '../../economy/actions.js';
import { withReactionStatus } from '../../lib/cosmetics.js';
import { richTableCard } from '../../lib/interactiveKit.js';

const ENTRY_FEE = 200;
const JOIN_WINDOW_MS = 90 * 1000;
const MAX_CREW = 6;

// in-memory job state per chat (module scope — dies with the process, fine)
const jobs = new Map();

function getJob(chatId) {
  const job = jobs.get(chatId);
  if (!job) return null;
  if (Date.now() - job.startedAt > JOIN_WINDOW_MS + 5000) {
    jobs.delete(chatId); // stale session — window closed long ago
    return null;
  }
  return job;
}

async function resolveHeist(sock, m, job) {
  const crew = job.crew;
  const successChance = Math.min(0.9, 0.35 + (crew.length - 1) * 0.11);
  const success = Math.random() < successChance;
  jobs.delete(job.chatId);

  if (success) {
    // vault: entry fees x3 + a random vault bonus, split evenly
    const vault = crew.length * ENTRY_FEE * 3 + Math.floor(Math.random() * 1500);
    const share = Math.floor(vault / crew.length);
    const rows = [];
    for (const jid of crew) {
      const u = db.getUser(jid);
      const { result, lines } = commitAction(jid, {
        coinsDelta: share, // net + (share - entry) since fee was already paid
        xp: 30,
        stats: { heists: (u.stats?.heists ?? 0) + 1, heistWins: (u.stats?.heistWins ?? 0) + 1 },
        quest: 'heistWins',
      });
      rows.push([`@${jid.split('@')[0]}`, `+${share.toLocaleString()} (now ${(result.after.coins ?? 0).toLocaleString()})`]);
      for (const line of lines) {
        await sock.sendMessage(job.chatId, { text: `${line}\n@${jid.split('@')[0]}`, mentions: [jid] }).catch(() => {});
      }
    }
    try {
      await richTableCard(sock, job.chatId, {
        title: '🏦 HEIST SUCCESSFUL!',
        headers: ['Crew', 'Cut'],
        rows,
        footer: `The vault cracked. ${Math.round(successChance * 100)}% odds with a crew of ${crew.length}.`,
        buttons: [
          { label: 'Start a new job', cmd: '.heist' },
          { label: 'Leaderboard', cmd: '.top' },
        ],
      }, { mentions: crew });
    } catch (_) {
      await sock.sendMessage(job.chatId, {
        text: `🏦 *HEIST SUCCESSFUL!* The crew of ${crew.length} split ${vault.toLocaleString()} coins.\n` +
          crew.map(j => `@${j.split('@')[0]} +${share.toLocaleString()}`).join('\n'),
        mentions: crew,
      }).catch(() => {});
    }
  } else {
    // fail: entries lost; 40% chance each member gets jailed 3 min
    const busted = [];
    for (const jid of crew) {
      const u = db.getUser(jid);
      const jail = Math.random() < 0.4 ? Date.now() + 3 * 60000 : 0;
      const stats = { heists: (u.stats?.heists ?? 0) + 1 };
      commitAction(jid, { coinsDelta: 0, stats, extra: jail ? { jailUntil: jail } : {} });
      if (jail) busted.push(jid);
    }
    await sock.sendMessage(job.chatId, {
      text: `🚨 *THE HEIST FAILED!* Alarm tripped — everyone's cut of ${ENTRY_FEE} coins is gone with the wind.` +
        (busted.length ? `\n🚔 Busted & jailed: ${busted.map(j => '@' + j.split('@')[0]).join(', ')}` : '\n💨 Everyone escaped the cops... this time.'),
      mentions: busted,
    }).catch(() => {});
  }
}

export default {
  name: 'heist',
  aliases: ['bankheist'],
  category: 'economy',
  description: `Co-op heist! ${ENTRY_FEE} coins entry. Start with .heist, crew joins within 90s. More crew, better odds.`,
  cooldown: 4000,
  groupOnly: true,
  execute: async ({ m, sock, prefix }) => {
    const p = prefix || '.';
    await withReactionStatus(m, async () => {
      try {
        await withUserLock(m.sender, async () => {
          const u = db.getUser(m.sender);
          const now = Date.now();
          const sub = String(m.args?.[0] ?? '').toLowerCase();

          const existing = getJob(m.from);

          if (existing && existing.state === 'open') {
            // ── join ─────────────────────────────────────────────────────────
            if (Date.now() - existing.startedAt >= JOIN_WINDOW_MS) {
              return await m.reply.warn('The doors just closed — the job is being resolved!', 'HEIST');
            }
            if (existing.crew.includes(m.sender)) {
              const left = Math.ceil((JOIN_WINDOW_MS - (now - existing.startedAt)) / 1000);
              return await m.reply.warn(`You're already in the crew. Job starts in *${left}s*.`, 'HEIST');
            }
            if (existing.crew.length >= MAX_CREW) {
              return await m.reply.warn(`Crew is full (${MAX_CREW}/${MAX_CREW}). Good luck in there!`, 'HEIST');
            }
            if (u.jailUntil && now < u.jailUntil) {
              return await m.reply.warn('🚔 You\'re in jail — the crew doesn\'t hire snitches with records.', 'HEIST');
            }
            if ((u.coins ?? 0) < ENTRY_FEE) {
              return await m.reply.warn(`Entry fee is ${ENTRY_FEE} coins and you're broke.`, 'HEIST');
            }
            existing.crew.push(m.sender);
            db.setUser(m.sender, { coins: (u.coins ?? 0) - ENTRY_FEE });
            const left = Math.ceil((JOIN_WINDOW_MS - (now - existing.startedAt)) / 1000);
            await sock.sendMessage(m.from, {
              text: `🎭 *@${m.sender.split('@')[0]}* joined the *${existing.crew.length}/${MAX_CREW}* crew! Job starts in *${left}s* — type *${p}heist join*!`,
              mentions: [m.sender],
            }, { quoted: m }).catch(() => {});
            return;
          }

          // ── start a fresh job ─────────────────────────────────────────────
          if (sub === 'join') {
            return await m.reply.warn('No job in progress. Start one with *.heist start*.', 'HEIST');
          }
          if (u.jailUntil && now < u.jailUntil) {
            return await m.reply.warn('🚔 You\'re in jail. Plan better next time.', 'HEIST');
          }
          if ((u.coins ?? 0) < ENTRY_FEE) {
            return await m.reply.warn(`You need ${ENTRY_FEE} coins to bankroll a job.`, 'HEIST');
          }

          const job = {
            chatId: m.from,
            creator: m.sender,
            crew: [m.sender],
            startedAt: now,
            state: 'open',
          };
          jobs.set(m.from, job);
          db.setUser(m.sender, { coins: (u.coins ?? 0) - ENTRY_FEE });

          await sock.sendMessage(m.from, {
            text:
              `🏦 *A HEIST IS BEING PLANNED!*\n\n` +
              `*@${m.sender.split('@')[0]}* is putting a crew together.\n` +
              `💰 Entry: ${ENTRY_FEE} coins\n` +
              `⏳ Doors close in *90 seconds*\n\n` +
              `Type *${p}heist join* to get a cut! Crew odds: ${crewChance(2)}%+`,
            mentions: [m.sender],
          }, { quoted: m }).catch(() => {});

          // resolve the job when the window closes
          setTimeout(async () => {
            const live = jobs.get(m.from);
            if (live === job && live.state === 'open') {
              live.state = 'resolving';
              try {
                await resolveHeist(sock, m, live);
              } catch (e) {
                console.warn('[heist] resolve failed:', e.message);
                jobs.delete(m.from);
              }
            }
          }, JOIN_WINDOW_MS);
        });
      } catch (e) {
        if (String(e?.message).includes('transaction')) return await m.reply.warn(String(e.message), 'HEIST');
        await m.reply.error(`Heist error: ${e.message}`);
      }
    });
  },
};

const crewChance = (n) => Math.round(Math.min(0.9, 0.35 + (n - 1) * 0.11) * 100);
