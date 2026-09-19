import { config } from '../../config/index.js';
import { client } from '../core/client.js';
import { findCustomCommand } from '../plugins/group/customcmd.js';
import { db } from '../database/db.js';
import { serialize } from '../core/serializer.js';
import { checkStickerCommand } from '../lib/stickerCommand.js';
import { MASS_MENTION_THRESHOLD } from '../plugins/group/antitag.js';
import { formatDuration } from '../lib/utils.js';
import { trackActivity } from '../lib/heatmap.js';
import {
  grantXp,
  canGainMessageXp,
  randomMessageXp,
  rankBadge,
  progressBar,
  getLevelProgress,
} from '../economy/leveling.js';
import { getDisplayName } from '../lib/displayName.js';
import { strikeAndKick, isExempt, isFlooding, resetFlood, snitchRemember } from '../lib/antiGuard.js';
import { isBotName, scoreBotMessage, trackForeignCommand, resetBotTracker } from '../lib/botDetector.js';
import { rememberDevice } from '../lib/deviceCache.js';
import { downloadMediaMessage } from 'baileys';
import { getRandomResponse } from '../nexora-messages.js';
import { suggestCommand } from '../lib/fuzzyMatch.js';
import { toSmallcaps } from '../lib/smallcaps.js';
import { actionCard, mixedCard } from '../lib/interactiveKit.js';
import { connectionMonitor } from '../core/connectionMonitor.js';

// ── Hoisted regexes (compiled once, not on every message) ─────────────────────
// Anti-link pattern: matches URLs and known social/messaging platform links.
// Requires either a protocol (http/https), a www. prefix, OR a domain with a
// path segment after the TLD. This prevents false positives on normal text
// like "hello.world" or "version 1.2" or "awesome.io" while still catching
// real links like "example.com/page", "t.me/groupname", "bit.ly/abc".
const LINK_RE = /https?:\/\/\S+|www\.\S+|\b[a-z0-9-]+\.(?:com|net|org|io|gg|me|be|ly|app|dev|co|xyz|info|biz|tv|fm|sh)\/\S+/i;


/**
* Passive XP-from-activity: every real, non-command, non-bot message earns
* the sender a small random amount of XP, gated by a per-user/per-chat
* cooldown so a spam burst can't be farmed for levels. Runs for every
* message (including ones that also happen to be commands) since the
* user is still "active" either way.
*/
export async function awardMessageXp(m, sock) {
  try {
    if (m.fromMe || m.from === 'status@broadcast') return;
    const userData = db.getUser(m.sender);
    if (userData?.banned) return;
    if (!canGainMessageXp(client, m.sender, m.from)) return;

    // Heatmap tally — same "real message" definition as passive XP
    trackActivity(m.from, m.sender);

    const result = grantXp(db, m.sender, { xp: randomMessageXp() });
    if (!result.leveledUp) return;

    // Celebratory coin bonus on top of the xp itself — leveling up from
    // chat activity should feel as rewarding as claiming `!daily`.
    // Granted BEFORE the announcement gate: silencing the card never
    // costs the user their coins.
    const coinBonus = result.levelsGained * config.xp.levelUpCoinBonus;
    const bonusResult = coinBonus > 0 ? grantXp(db, m.sender, { coins: coinBonus }) : result;

    // Level-up ANNOUNCEMENT gate — only the card is suppressible.
    // Precedence: per-group flag > global db flag > XP_ANNOUNCE env default.
    const groupFlag = m.isGroup ? db.getGroup(m.from).levelUp : undefined;
    const globalFlag = db.getSettings().levelUpAnnounce;
    const announce =
      groupFlag !== undefined
        ? groupFlag
        : globalFlag !== undefined
          ? globalFlag
          : config.xp.levelUpAnnounce;
    if (!announce) return;

    const progress = getLevelProgress(bonusResult.after.xp);
    const bar = progressBar(progress.xpIntoLevel, progress.nextLevelXp - progress.currentLevelXp, 10);
    const name = await getDisplayName(sock, m.sender);
    const level = bonusResult.after.level;
    const badge = rankBadge(bonusResult.after.level);

    // ── Level-up card — compact native celebration, not an ASCII wall ──
    // Group feedback on the old box announcement was that it looked like
    // spam ("trash"). This is now one small card: the user's own profile
    // picture as the header image, four short lines, one button. Plain
    // fallback is 2 lines with a real mention.
    let ppUrl = null;
    try { ppUrl = await sock.profilePictureUrl(m.sender, 'image'); } catch (_) {}

    const bodyLines = [
      `✨ *${name}* just reached *Level ${level}*`,
      '',
      `${badge}`,
      `${bar}`,
      `${progress.xpToNextLevel.toLocaleString()} XP to the next level${coinBonus > 0 ? ` · 🪙 +${coinBonus.toLocaleString()} coins` : ''}`,
    ];
    // Fork quirk: the native-flow header title only renders when header media
    // is attached. Without a profile picture the 🎉 line must live in the body.
    if (!ppUrl) bodyLines.unshift(`🎉 *LEVEL UP*`, '');

    try {
      const { default: capabilities } = await import('../core/capabilities.js');
      if (!capabilities.nativeFlow) throw new Error('native flow disabled');
      const sent = await mixedCard(sock, m.from, {
        text:     bodyLines.join('\n'),
        // title renders above the header image — only meaningful with media
        ...(ppUrl ? {
          title: `🎉 ${toSmallcaps('LEVEL UP')}`,
          image: { url: ppUrl },
        } : {}),
        footer: `${toSmallcaps('tap to view the full profile')} • © NEXORA-MD`,
      }, [
        { kind: 'action', label: `👤 ${toSmallcaps('View Profile')}`, cmd: '.profile' },
      ], { quoted: m });
      if (sent) return;
    } catch (err) {
      console.warn('[XP] level-up card failed, plain fallback:', err.message);
    }

    const number = m.sender.split('@')[0].split(':')[0];
    await m.reply(
      [
        `🎉 @${number} hit *Level ${level}*! ${badge}`,
        `${bar}${coinBonus > 0 ? ` · 🪙 +${coinBonus.toLocaleString()} coins` : ''}`,
      ].join('\n'),
      { mentions: [m.sender] }
    );
  } catch (err) {
    console.error('[XP] Failed to award message xp:', err.message || err);
  }
}

/**
* Main incoming message handler — full command pipeline.
*/
/**
 * Anti-view-once rescue: download a view-once message's media and repost it
 * with a "saved" caption, so the content survives the tap-to-view expiry.
 * Falls back to a text notice when the media can't be re-downloaded.
 */
async function handleViewOnceRescue(rawMessage, sock, jid, sender) {
  const raw = rawMessage.message || {};
  const voKey = ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV3']
    .find((k) => raw[k]?.message);
  if (!voKey) return;
  const inner = raw[voKey].message;
  const type = Object.keys(inner)[0];
  const num = String(sender).split('@')[0].split(':')[0];
  const caption = `👁️ *View-once rescued* — from @${num}`;
  const mentions = [sender];

  try {
    const buffer = await downloadMediaMessage(rawMessage, 'buffer', {});
    if (!buffer?.length) throw new Error('empty media buffer');

    const payload = { mentions };
    if (type === 'imageMessage')   Object.assign(payload, { image: buffer, caption, mimetype: inner[type]?.mimetype || 'image/jpeg' });
    else if (type === 'videoMessage') Object.assign(payload, { video: buffer, caption, mimetype: inner[type]?.mimetype || 'video/mp4', gifPlayback: !!inner[type]?.gifPlayback });
    else if (type === 'audioMessage' || type === 'pttMessage') Object.assign(payload, { audio: buffer, ptt: true, mimetype: inner[type]?.mimetype || 'audio/ogg; codecs=opus' });
    else if (type === 'stickerMessage') Object.assign(payload, { sticker: buffer });
    else if (type === 'documentMessage') Object.assign(payload, { document: buffer, fileName: inner[type]?.fileName || 'view-once', mimetype: inner[type]?.mimetype });
    else throw new Error(`unsupported view-once type: ${type}`);

    await sock.sendMessage(jid, payload);
  } catch (err) {
    await sock.sendMessage(jid, {
      text: `👁️ *View-once from @${num}* could not be saved (${err.message}). Type: ${type}`,
      mentions,
    }).catch(() => {});
  }
}

export async function handleMessage(rawMessage, sock) {
try {
  // Fast-path: skip messages with no content or no destination
  if (!rawMessage?.message) return;
  if (!rawMessage?.key?.remoteJid) return;

  // Skip protocol messages immediately (key rotations, receipts, etc.)
  if (rawMessage.message.protocolMessage) return;
  if (rawMessage.message.senderKeyDistributionMessage) return;

  // Broadcast surfaces (statuses, channels) are never command surfaces —
  // critical now that extra sessions process their own account's messages.
  const entryJid = rawMessage.key?.remoteJid;
  if (entryJid === 'status@broadcast' || entryJid?.endsWith('@newsletter')) return;

  // Build the rich serialized message object
  const m = await serialize(rawMessage, sock);
  if (!m) return;

  const body = m.body ?? '';
  const jid = m.from;
  const sender = m.sender;
  const isGroupMsg = m.isGroup;

  // Device cache: keep the last raw message metadata per sender for .device
  rememberDevice(rawMessage);

  // ── Passive XP from activity ────────────────────────────────────────────
  // Fire-and-forget: never let xp bookkeeping delay or break command handling.
  awardMessageXp(m, sock).catch(err => {
    console.error('[XP UNHANDLED] Background XP error:', err.message || err);
  });

  // Auto-read
  if (config.autoRead) {
    await sock.readMessages([rawMessage.key]).catch(() => {});
  }

  // ── Anti-link enforcement ───────────────────────────────────────────────
  // Runs before the prefix gate so plain link messages (no command prefix) are caught.
  if (isGroupMsg && !m.fromMe) {
    const groupData = db.getGroup(jid);
    if (groupData?.antilink) {
      if (LINK_RE.test(body)) {
        try {
          const senderIsAdmin = await m.isAdmin();
          if (!senderIsAdmin && !(await m.isOwner)) {
            await sock.sendMessage(jid, { delete: m.key });
            const groupData2 = db.getGroup(jid);
            const groupWarns = groupData2.warnings || {};
            const warns = (groupWarns[sender] ?? 0) + 1;
            groupWarns[sender] = warns;
            db.setGroup(jid, { warnings: groupWarns });
            const senderNum = sender.split('@')[0].split(':')[0];
            await sock.sendMessage(jid, {
              text: `🚫 @${senderNum} Links are not allowed in this group!\n⚠️ Warning ${warns}/3${warns >= 3 ? ' — You have been removed.' : ''}`,
              mentions: [sender],
            });
            if (warns >= 3) {
              try {
                await sock.groupParticipantsUpdate(jid, [sender], 'remove');
                groupWarns[sender] = 0;
                db.setGroup(jid, { warnings: groupWarns });
              } catch (_) {
                // Bot lacks admin privileges — keep warnings so spammer is caught next time
                await sock.sendMessage(jid, {
                  text: `⚠️ Cannot remove @${senderNum} — bot is not a group admin. Warnings retained.`,
                  mentions: [sender],
                }).catch(() => {});
              }
            }
            return;
          }
        } catch (err) {
          console.error('[ANTILINK] Error enforcing anti-link:', err.message);
        }
      }
    }
  }

  // ── Anti-tag (mass-mention) enforcement ─────────────────────────────────
  // Same enforcement shape as anti-link above: runs before the prefix gate
  // so a plain mass-mention message (no command prefix) is still caught.
  if (isGroupMsg && !m.fromMe) {
    const groupData = db.getGroup(jid);
    if (groupData?.antitag) {
      const mentioned = rawMessage.message?.extendedTextMessage?.contextInfo?.mentionedJid
        || m.msg?.contextInfo?.mentionedJid
        || [];
      if (mentioned.length >= MASS_MENTION_THRESHOLD) {
        try {
          const senderIsAdmin = await m.isAdmin();
          if (!senderIsAdmin && !(await m.isOwner)) {
            await sock.sendMessage(jid, { delete: m.key });
            const groupData3 = db.getGroup(jid);
            const groupWarns = groupData3.warnings || {};
            const warns = (groupWarns[sender] ?? 0) + 1;
            groupWarns[sender] = warns;
            db.setGroup(jid, { warnings: groupWarns });
            const senderNum = sender.split('@')[0].split(':')[0];
            await sock.sendMessage(jid, {
              text: `🚫 @${senderNum} Mass-mentioning ${mentioned.length} members at once is not allowed!\n⚠️ Warning ${warns}/3${warns >= 3 ? ' — You have been removed.' : ''}`,
              mentions: [sender],
            });
            if (warns >= 3) {
              try {
                await sock.groupParticipantsUpdate(jid, [sender], 'remove');
                groupWarns[sender] = 0;
                db.setGroup(jid, { warnings: groupWarns });
              } catch (_) {
                // Bot lacks admin privileges — keep warnings
                await sock.sendMessage(jid, {
                  text: `⚠️ Cannot remove @${senderNum} — bot is not a group admin. Warnings retained.`,
                  mentions: [sender],
                }).catch(() => {});
              }
            }
            return;
          }
        } catch (err) {
          console.error('[ANTITAG] Error enforcing anti-tag:', err.message);
        }
      }
    }
  }

  // ── Anti-guard suite (antisticker / antispam / antiword / antidelete
  // / antiviewonce) ─────────────────────────────────────────────────────
  // Same position as antilink/antitag: before the prefix gate so plain
  // (non-command) messages are still policed. Strikes are shared with
  // antilink/antitag via the per-group warnings map.
  if (isGroupMsg && !m.fromMe) {
    try {
      const guard = db.getGroup(jid);
      const exempt = await isExempt(m);

      // Snitch cache: remember every group message (bounded per group)
      if (guard.antidelete || guard.antiviewonce) {
        snitchRemember(jid, {
          id: m.key.id, sender, body, type: m.type,
          message: rawMessage.message,
        });
      }

      if (!exempt) {
        // ── Anti-sticker: non-admin stickers are deleted ──
        if (guard.antisticker && m.type === 'stickerMessage') {
          await strikeAndKick(sock, { jid, sender, key: m.key, reason: 'stickers are not allowed in this group!' });
          return;
        }

        // ── Anti-spam: flood control (sliding window) ──
        if (guard.antispam && isFlooding(jid, sender)) {
          await strikeAndKick(sock, { jid, sender, key: m.key, reason: 'flooding the group! Slow down.' });
          resetFlood(jid, sender);
          return;
        }

        // ── Anti-bot: detect and remove bot accounts ──
        if (guard.antibot?.on) {
          const whitelist = Array.isArray(guard.antibot.whitelist) ? guard.antibot.whitelist : [];
          if (!whitelist.includes(sender)) {
            const known = new Set([...client.commands.keys()]);
            for (const [alias, primary] of client.aliases) { known.add(alias); known.add(primary); }
            const nameHit   = isBotName(rawMessage.pushName);
            const sig       = scoreBotMessage({ pushName: rawMessage.pushName, body, knownCommands: known });
            const streaking = trackForeignCommand(jid, sender, body, known);

            // Identity tier: verified bot NAME — remove immediately. A
            // behavioral signal alone never instant-kicks (a human pasting
            // a decorated menu must not lose membership over one message);
            // behavior is handled by the scored strike below.
            if (nameHit) {
              try {
                await sock.groupParticipantsUpdate(jid, [sender], 'remove');
                await sock.sendMessage(jid, {
                  text: `🤖 *Anti-bot* — @${sender.split('@')[0]} was removed. Bot account detected (name: ${rawMessage.pushName}).`,
                  mentions: [sender],
                });
              } catch (_) { /* kick failed — bot not admin; scoring continues */ }
              resetBotTracker(jid, sender);
              return;
            }

            let score = sig.score + (streaking ? 1 : 0);

            // Borderline: corroborate with a profile-picture check (bots
            // usually have no pfp). Only fetched when sync score is 2, so
            // this adds at most one light lookup per borderline sender.
            if (score === 2) {
              try {
                const pfp = await sock.profilePictureUrl?.(sender, 'url');
                if (!pfp) score += 1;
              } catch (_) { /* lookup failed — keep score */ }
            }

            if (score >= 3) {
              await strikeAndKick(sock, {
                jid, sender, key: m.key,
                reason: `bot behavior detected (${[...sig.reasons, ...(streaking ? ['foreign command streak'] : [])].join('; ')}). Human? Ask an admin to whitelist you.`,
              });
              resetBotTracker(jid, sender);
              return;
            }
          }
        }

        // ── Anti-word: banned words are deleted ──
        if (guard.antiword?.on && Array.isArray(guard.antiword.words) && guard.antiword.words.length && body) {
          const hit = guard.antiword.words.find((w) => {
            const esc = String(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return new RegExp(`(^|[^\\p{L}])${esc}([^\\p{L}]|$)`, 'iu').test(body);
          });
          if (hit) {
            await strikeAndKick(sock, { jid, sender, key: m.key, reason: 'banned words are not allowed in this group!' });
            return;
          }
        }
      }
    } catch (err) {
      console.error('[ANTIGUARD] Error in anti-guard suite:', err.message);
    }
  }

  // ── Anti-view-once: save view-once media and repost it ────────────────
  // Never punishes — it rescues. Enabled per group; skips the bot's own
  // messages. Runs fire-and-forget so it never blocks the pipeline.
  if (isGroupMsg && !m.fromMe && db.getGroup(jid).antiviewonce) {
    const raw = rawMessage.message || {};
    const voKey = ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV3']
      .find((k) => raw[k]?.message);
    if (voKey) {
      handleViewOnceRescue(rawMessage, sock, jid, sender).catch((err) => {
        console.error('[ANTIVO] Error rescuing view-once:', err.message);
      });
    }
  }

  // ── AFK notifications ───────────────────────────────────────────────────
  // Runs before the prefix gate so plain (non-command) mentions/replies
  // still trigger the notice, and any message from an AFK user clears it.
  if (!m.fromMe && body) {
    try {
      const senderData = db.getUser(sender);
      const isAfkCommand = config.prefix.some(p => body.startsWith(p))
        && body.slice(1).trim().split(/\s+/)[0]?.toLowerCase() === 'afk';

      if (senderData.afk?.active && !isAfkCommand) {
        db.setUser(sender, { afk: { active: false } });
        const awayFor = formatDuration(Date.now() - senderData.afk.since);
        await sock.sendMessage(jid, {
          text: `👋 Welcome back @${sender.split('@')[0]}! You were AFK for ${awayFor}.`,
          mentions: [sender],
        }, { quoted: rawMessage }).catch(() => {});
      }

      const mentionedAfk = new Set([
        ...(m.msg?.contextInfo?.mentionedJid || []),
        ...(m.quoted?.sender ? [m.quoted.sender] : []),
      ]);

      for (const jidCandidate of mentionedAfk) {
        if (jidCandidate === sender) continue;
        const targetData = db.getUser(jidCandidate);
        if (targetData.afk?.active) {
          const awayFor = formatDuration(Date.now() - targetData.afk.since);
          await sock.sendMessage(jid, {
            text: `💤 @${jidCandidate.split('@')[0]} is AFK (${awayFor} ago): ${targetData.afk.reason}`,
            mentions: [jidCandidate],
          }, { quoted: rawMessage }).catch(() => {});
        }
      }
    } catch (err) {
      console.error('[AFK] Error handling AFK notification:', err.message);
    }
  }

  // ── Sticker command shortcut ────────────────────────────────────────────
  // Runs before the prefix gate: sticker messages have no text body so they
  // would always be dropped without this check. Unregistered stickers also
  // exit here — no point running the prefix pipeline on a media message.
  if (m.type === 'stickerMessage') {
    const stickerCmd = checkStickerCommand(m);
    if (stickerCmd) {
      const resolvedName = client.aliases.get(stickerCmd) ?? stickerCmd;
      const command = client.commands.get(resolvedName);
      if (command) {
        try {
          await command.execute({
            m, sock, jid, sender,
            args: [], body: '', prefix: '',
            isGroup: isGroupMsg, isOwner: m.isOwner,
            rawMessage, db, client, config,
            reply: m.reply, react: m.react,
          });
          console.log(`[STICKER-CMD] ${command.name} ← ${sender.split('@')[0]} in ${isGroupMsg ? jid : 'DM'}`);
        } catch (err) {
          console.error(`[STICKER-CMD ERROR] ${command.name}:`, err.message || err);
        }
      }
    }
    return;
  }

  // ── First-time user onboarding removed (was spamming groups) ──


  // Only respond to prefixed commands
  const prefix = config.prefix.find(p => body.startsWith(p));
  if (!prefix) return;

  const args = body.slice(prefix.length).trim().split(/\s+/);
  const commandName = args.shift()?.toLowerCase();
  if (!commandName) return;

  const resolvedName = client.aliases.get(commandName) || commandName;
  const command = client.commands.get(resolvedName);
  if (!command) {
    // ── Group custom commands (.setcmd) ─────────────────────────────────
    // Registry lookup missed — but a group admin may have DEFINED this
    // name via .setcmd. Deliberate custom commands beat the fuzzy
    // suggestion, and can never shadow built-ins (they only run here).
    // Execution is open to everyone in the group that defined them.
    if (isGroupMsg) {
      try {
        const custom = findCustomCommand(jid, commandName);
        if (custom) {
          const senderName = rawMessage.pushName || (sender || '').split('@')[0];
          let chatName = 'this group';
          try { chatName = (await sock.groupMetadata?.(jid))?.subject || chatName; } catch (_) {}
          await m.reply(
            custom.text
              .replaceAll('{sender}', senderName)
              .replaceAll('{chat}', chatName)
          );
          return;
        }
      } catch (_) { /* custom command failed — fall through to suggestion */ }
    }

    // ── "Did you mean?" fuzzy suggestion ──────────────────────────────
    // Instead of silently ignoring, suggest the closest command match.
    // When a match is found, send an interactive button so the user can
    // tap to run it directly — no retyping needed.
    const allNames = [...client.commands.keys(), ...client.aliases.keys()];
    const suggestion = suggestCommand(commandName, allNames);
    if (suggestion) {
      try {
        await actionCard(sock, jid, {
          text:   `${getRandomResponse('not_found', `${prefix}${commandName}`)}\n\nDid you mean: *${prefix}${suggestion}*?`,
          footer: `${config.botName} • Did you mean?`,
        }, [
          { label: `▶️ Run ${prefix}${suggestion}`, cmd: `${prefix}${suggestion}` },
          { label: '📖 View Help',                      cmd: `${prefix}help` },
        ], { quoted: rawMessage });
      } catch (_) {
        await m.reply(
          `${getRandomResponse('not_found', `${prefix}${commandName}`)}\n\nDid you mean: *${prefix}${suggestion}*?`
        );
      }
    } else {
      await m.reply(
        `${getRandomResponse('not_found', `${prefix}${commandName}`)}\n\nType *${prefix}help* to see all commands, or *${prefix}menu* for the interactive console.`
      );
    }
    return;
  }

  // ── Permission flags ────────────────────────────────────────────────────
  // Diagnostics: sender jid form + fromMe + owner result. Critical for
  // diagnosing LID-vs-PN owner mismatches on fresh links (see resolveIsOwner).
  console.log(`[CMD] ${prefix}${resolvedName} ← ${sender}${m.fromMe ? ' (fromMe)' : ''}${isGroupMsg ? ' [group]' : ' [dm]'}`);

  const perms = command.permissions || {};
  const ownerOnly = perms.owner ?? command.ownerOnly ?? false;
  const groupOnly = perms.groupOnly ?? command.groupOnly ?? false;
  const adminOnly = perms.admin ?? command.adminOnly ?? false;
  const botAdminRequired = perms.botAdmin ?? command.botAdmin ?? false;

  // Owner status is resolved once, in the serializer, following the real LID↔PN
  // bridge (sock.signalRepository.lidMapping) — do not recompute it here with a
  // raw string comparison, which breaks whenever WhatsApp presents the sender as
  // an opaque LID instead of a phone-number JID.
  // isOwner is an async getter (returns a Promise) — awaiting resolves and
  // caches it. Bare truthiness would make every check pass for everyone.
  const ownerCheck = await m.isOwner;

  // 1. Owner-only guard
  if (ownerOnly && !ownerCheck) {
    console.warn(`[CMD-DENY] ${resolvedName}: owner_only — sender ${sender} not in OWNER_NUMBERS (bot id: ${sock.user?.id})`);
    await m.reply(getRandomResponse('owner_only'));
    return;
  }

  // 2. Private mode guard — publicMode can be toggled at runtime via .self/.public
  // and is persisted in the database, so it must win over the static config default.
  const publicMode = db.getSettings().publicMode ?? config.publicMode;
  // requestable commands are exempt from private mode: they only FILE a
  // request (e.g. .pair) that the super owner must still approve — the
  // approval commands themselves stay owner-gated.
  if (!publicMode && !ownerCheck && !command.requestable) {
    console.warn(`[CMD-DENY] ${resolvedName}: private_mode — sender ${sender} is not owner`);
    await m.reply.warn('This bot is running in private mode. Only the owner can use commands.');
    return;
  }

  // 3. Group-only guard
  if (groupOnly && !isGroupMsg) {
    await m.reply(getRandomResponse('group_only'));
    return;
  }

  // 4. Admin guard (sender must be a group admin)
  if (adminOnly && isGroupMsg) {
    const senderIsAdmin = await m.isAdmin();
    if (!senderIsAdmin && !ownerCheck) {
      await m.reply(getRandomResponse('permission_denied'));
      return;
    }
  }

  // 5. Bot-admin guard (bot itself must be a group admin)
  if (botAdminRequired && isGroupMsg) {
    const botIsAdmin = await m.isBotAdmin();
    if (!botIsAdmin) {
      await m.reply(getRandomResponse('bot_not_admin'));
      return;
    }
  }

  // 6. Cooldown enforcement
  const now = Date.now();
  const cooldownKey = `${sender}_${resolvedName}`;
  const cooldownMs = command.cooldown ?? config.cooldownTime;
  const lastUsed = client.cooldowns.get(cooldownKey);

  if (lastUsed && now - lastUsed < cooldownMs) {
    const remainingMs = cooldownMs - (now - lastUsed);
    const remainingSec = remainingMs / 1000;
    let timeStr;
    if (remainingSec >= 60) {
      const mins = Math.floor(remainingSec / 60);
      const secs = Math.floor(remainingSec % 60);
      timeStr = secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    } else {
      timeStr = `${remainingSec.toFixed(1)}s`;
    }
    // ── Cooldown UX: suggest related commands the user can try while waiting.
    // This turns a dead-end "wait" message into an actionable pivot.
    const cooldownMsg = getRandomResponse('cooldown', command.name, timeStr);
    const sameCategory = [...client.commands.values()]
      .filter(c => c.category === command.category && c.name !== command.name)
      .slice(0, 3)
      .map(c => c.name);
    if (sameCategory.length > 0) {
      try {
        await actionCard(sock, jid, {
          text:   `${cooldownMsg}\n\nWhile you wait, try:`,
          footer: `${config.botName} • Cooldown`,
        }, sameCategory.map(c => ({ label: `▶️ ${prefix}${c}`, cmd: `${prefix}${c}` })), { quoted: rawMessage });
      } catch (_) {
        await m.reply(cooldownMsg);
      }
    } else {
      await m.reply(cooldownMsg);
    }
    return;
  }

  client.cooldowns.set(cooldownKey, now);
  setTimeout(() => client.cooldowns.delete(cooldownKey), cooldownMs);

  // 7. Database ban check
  const userData = db.getUser(sender);
  if (userData?.banned) {
    await m.reply.error('You have been banned from using this bot.');
    return;
  }

  // ── Build context for plugin execute() ─────────────────────────────────
  const ctx = {
    m,
    sock,
    jid,
    sender,
    args,
    body,
    prefix,
    isGroup: isGroupMsg,
    isOwner: ownerCheck,
    rawMessage,
    db,
    client,
    config,
    reply: m.reply,
    react: m.react
  };

  // ── Send "composing" presence so users see the bot is working ────────
  try {
    await sock.sendPresenceUpdate('composing', jid).catch(() => {});
  } catch (_) {}

  const _replyCountBefore = m._replyCount || 0;
  try {
    await command.execute(ctx);
    console.log(`[CMD] ${command.name} ← ${sender.split('@')[0]} in ${isGroupMsg ? jid : 'DM'}`);
    connectionMonitor.recordCommandExecuted(command.name);

    // ── Track command usage statistics ───────────────────────────────
    // stats.commandsUsed is read by the menu collector and aiDynamic menu
    // type but was never written — the counters were always empty.
    try {
      if (!db.data.stats) db.data.stats = {};
      if (!db.data.stats.commandsUsed) db.data.stats.commandsUsed = {};
      db.data.stats.commandsUsed[command.name] = (db.data.stats.commandsUsed[command.name] || 0) + 1;
      db.save();
    } catch (_) {}
  } catch (execErr) {
    console.error(`[CMD ERROR] ${command.name} threw:`, execErr.message || execErr);
    // Only send an error reply if the plugin didn't already send one.
    // This prevents double messages when a plugin catches an error,
    // sends its own m.reply.error(...), then re-throws.
    const _repliesAfter = m._replyCount || 0;
    if (_repliesAfter <= _replyCountBefore) {
      try {
        const errText = getRandomResponse('exec_error', command.name, execErr.message || 'Unknown error');
        const helpHint = `\n\n_Type \`${prefix}help ${command.name}\` for usage info, or try again._`;
        await m.reply(errText + helpHint);
      } catch (_) {}
    }
  } finally {
    // Stop "composing" presence regardless of success/failure
    try { await sock.sendPresenceUpdate('paused', jid).catch(() => {}); } catch (_) {}
  }

} catch (err) {
  console.error('[HANDLER ERROR] handleMessage crashed:', err.message || err);
}
}

export default handleMessage;
