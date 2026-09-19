import { greetingManager } from '../greetings/greetingManager.js';
import { db } from '../database/db.js';
import { getLinkedBotPhones } from '../core/sessionManager.js';
import { isBotName } from '../lib/botDetector.js';
import { mixedCard } from '../lib/interactiveKit.js';
import capabilities from '../core/capabilities.js';

/**
 * Routes group participant events to the canonical greeting pipeline.
 *
 * Runtime path (single source of truth):
 *   group-participants.update
 *     → handleGroupParticipantsUpdate   (this file — routing only)
 *     → greetingManager                 (orchestration + milestones + admin alerts)
 *     → greetingRenderer                (queue, style selection, profile pic, audio)
 *     → greetingBuilder                 (placeholder expansion)
 *     → greetingConfig                  (greeting.json — enabled, style, text, image)
 *
 * Toggle commands (.welcome on/off, .goodbye on/off) write to greetingConfig.
 * greetingRenderer checks greetingConfig.enabled / goodbyeEnabled before sending.
 *
 * Admin events (promote / demote) are forwarded to greetingManager so the bot
 * can send formatted alerts — these were previously unhandled.
 */
export async function handleGroupParticipantsUpdate(update, sock) {
  try {
    const { id: groupJid, participants, action } = update;
    if (!groupJid || !participants?.length) return;

    // Normalize participant entries — some event shapes hand over objects
    // ({ jid, lid }) instead of plain JID strings, which crashed the
    // greeting renderer (userJid.split is not a function).
    const normaliseP = (p) => typeof p === 'string'
      ? p
      : (p?.jid || p?.id || p?.lid || null);

    if (action === 'add') {
      for (const rawP of participants) {
        const participant = normaliseP(rawP);
        if (!participant) continue;

        // ── Bot added to a new group: one-time intro card ────────────────
        // Fires only for our own number(s) so it never spams member joins.
        const pNum = participant.split('@')[0].split(':')[0];
        const botSelf = sock.user?.id?.split('@')[0]?.split(':')[0];
        const isBotSelf = pNum === botSelf
          || getLinkedBotPhones().some((x) => String(x).split('@')[0].split(':')[0] === pNum);
        if (isBotSelf && action === 'add') {
          try {
            let meta = null;
            try { meta = await sock.groupMetadata(groupJid); } catch (_) { /* non-fatal */ }
            const intro =
              `✦ *I'm in.*\n\n` +
              `Hey${meta?.subject ? ` *${meta.subject}*` : ' everyone'} — NEXORA-MD just landed in this group.\n\n` +
              `Here's the 10-second tour:\n` +
              `• \`.menu\` — every command, swipeable\n` +
              `• \`.groupsettings\` — Protection Hub & group config\n` +
              `• \`.remind 30m <text>\` — reminders that survive restarts\n\n` +
              `_Group admins can tune everything with \`.groupsettings\`._`;
            try {
              if (capabilities.richResponse) {
                await mixedCard(sock, groupJid, { text: intro, footer: 'NEXORA-MD' }, [
                  { kind: 'action', label: '📖 Menu', cmd: '.menu' },
                  { kind: 'action', label: '🛡️ Protection Hub', cmd: '.groupsettings' },
                ]);
              } else {
                await sock.sendMessage(groupJid, { text: intro });
              }
            } catch (_) {
              await sock.sendMessage(groupJid, { text: intro }).catch(() => {});
            }
          } catch (err) {
            console.warn('[GROUP] bot intro card failed:', err.message || err);
          }
          continue; // no greeting/anti gates for our own join
        }

        // ── Anti-foreign: remove numbers outside the allowed country codes ──
        // Exempts the bot's own numbers (main + paired sessions) and is
        // skipped entirely when the bot isn't a group admin (kick would
        // just fail anyway — the greeting still fires).
        // ── Anti-bot join gate: verified bot names are turned away ──────
        const antibot = db.getGroup(groupJid).antibot;
        if (antibot?.on) {
          const whitelist = Array.isArray(antibot.whitelist) ? antibot.whitelist : [];
          const pNum      = participant.split('@')[0].split(':')[0]; // strip :N device suffix
          const botSelf   = sock.user?.id?.split('@')[0]?.split(':')[0];
          const isBotSelf = pNum === botSelf
            || getLinkedBotPhones().some((x) => String(x).split('@')[0].split(':')[0] === pNum);
          if (!isBotSelf && !whitelist.includes(participant)) {
            try {
              const [info] = await sock.onWhatsApp(participant);
              const vName  = info?.verifiedName || info?.verifiedBizName || '';
              if (vName && isBotName(vName)) {
                await sock.sendMessage(groupJid, {
                  text: `🤖 @${participant.split('@')[0]} was turned away at the door — bot account detected (name: ${vName}).`,
                  mentions: [participant],
                }).catch(() => {});
                await sock.groupParticipantsUpdate(groupJid, [participant], 'remove');
                continue;
              }
            } catch (_) { /* onWhatsApp lookup failed — allow, behavior scoring still watches */ }
          }
        }

        const foreign = db.getGroup(groupJid).antiforeign;
        if (foreign?.on && Array.isArray(foreign.allow) && participant.endsWith('@s.whatsapp.net')) {
          const num = participant.split('@')[0].split(':')[0]; // strip :N device suffix
          const linked = getLinkedBotPhones().map((x) => String(x).split('@')[0].split(':')[0]);
          const isBot = sock.user?.id?.split('@')[0]?.split(':')[0] === num || linked.includes(num);
          const allowed = foreign.allow.some((cc) => num.startsWith(String(cc)));
          if (!isBot && !allowed) {
            try {
              await sock.sendMessage(groupJid, {
                text: `🌍 @${num} was removed — this group only allows numbers from: ${foreign.allow.join(', ')}`,
                mentions: [participant],
              }).catch(() => {});
              await sock.groupParticipantsUpdate(groupJid, [participant], 'remove');
              continue; // no welcome for the removed number
            } catch (_) { /* fall through to greeting if the kick failed */ }
          }
        }

        await greetingManager.handleJoin(sock, groupJid, participant);
      }
    } else if (action === 'remove') {
      for (const rawP of participants) {
        const participant = normaliseP(rawP);
        if (!participant) continue;
        await greetingManager.handleLeave(sock, groupJid, participant);
      }
    } else if (action === 'promote') {
      await greetingManager.handlePromotion(sock, groupJid, participants);
    } else if (action === 'demote') {
      await greetingManager.handleDemotion(sock, groupJid, participants);
    }
  } catch (err) {
    console.error('[GROUP] Error in handleGroupParticipantsUpdate:', err.message || err);
  }
}

export default handleGroupParticipantsUpdate;
