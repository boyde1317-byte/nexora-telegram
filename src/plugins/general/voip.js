/**
 * @file src/plugins/general/voip.js
 *
 * .call / .endcall / .callstatus — REAL WhatsApp voice calls.
 *
 * The fork (baileys v0.3.18-r13) carries the ported zero-baileys VoIP stack:
 * the genuine 9.8MB WhatsApp WASM call engine, the signaling bridge (LID
 * resolution, device discovery, TC tokens, E2E sessions), the wrtc relay
 * transport and an ffmpeg-based audio feeder. This plugin is the thin
 * command layer on top of VoipClient:
 *
 *   .call <number|@user> [seconds]
 *     → Places an actual WhatsApp voice call to the target. When they
 *       answer, they hear silence by default.
 *       Reply to an audio / voice note / video while sending and the callee
 *       HEARS that media played into the call.
 *       Seconds clamp to 15–600 (default 60); the call auto-ends at zero.
 *
 *   .endcall → terminates the active call from this session.
 *   .callstatus → live state of the current call.
 *
 * The engine is heavy (~2–5s first init, ~120MB shared WASM memory), so one
 * VoipClient per sock session is created lazily and cached — never per
 * command. New calls require the previous one to have ended (WA enforces
 * one active call per account).
 */

import { resolveDisplayIdentity, mentionChip } from '../../lib/identity.js';
import { VoipClient } from 'baileys';
import fs from 'node:fs';
import path from 'node:path';

const MIN_SECONDS = 15;
const MAX_SECONDS = 600;
const DEFAULT_SECONDS = 60;

/** sock → { voip, call } cache: one engine instance per session. */
const sessions = new Map();

const isSock = (s) => !!(s && s.authState?.creds && s.authState.keys && s.ws);

async function getVoipSession(sock) {
  let entry = sessions.get(sock);
  if (entry) return entry;
  const voip = new VoipClient({ enableLogs: false });
  await voip.connectWithSocket(sock);
  entry = { voip, call: null };
  sessions.set(sock, entry);
  return entry;
}

function dropVoipSession(sock) {
  const entry = sessions.get(sock);
  if (!entry) return;
  try { entry.voip.disconnect(); } catch { /* already gone */ }
  sessions.delete(sock);
}

/** Resolve the call target: mention → replied sender → raw number. */
async function resolveTarget(sock, m, args, groupJid) {
  const mentioned = m.mentionedJid?.[0];
  const fromJid = async (jid) => {
    // a LID is not dialable — resolve it to the real phone first
    const id = await resolveDisplayIdentity(sock, jid, groupJid);
    return id.number ? { number: id.number, label: id.number ? '+' + id.number : id.label } : null;
  };
  if (mentioned) return await fromJid(mentioned);
  const replied = m.quoted?.sender || m.quoted?.participant;
  if (replied && (String(replied).endsWith('@s.whatsapp.net') || String(replied).includes('@lid'))) {
    return await fromJid(replied);
  }
  const raw = (args.find(a => /^\+?\d{7,15}$/.test(a.replace(/\D/g, '')) && a.replace(/\D/g, '').length >= 7) || '');
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 7) return { number: digits, label: `+${digits}` };
  return null;
}

/** Reply media → temp file the ffmpeg feeder can decode; else 'silence'. */
async function resolveAudioSource(m) {
  const q = m.quoted;
  if (!q) return { source: 'silence', tempPath: null, origin: 'silence' };
  const msg = q.message?.imageMessage ? q.message : q.message;
  const mt = q.mimetype || msg?.audioMessage?.mimetype || msg?.videoMessage?.mimetype || msg?.pttMessage?.mimetype;
  const hasAudio = !!(msg?.audioMessage || msg?.pttMessage || msg?.videoMessage || mt?.startsWith('audio/') || mt?.startsWith('video/'));
  if (!hasAudio) return { source: 'silence', tempPath: null, origin: 'silence' };
  try {
    const buffer = await q.download();
    if (!buffer?.length) throw new Error('empty download');
    const ext = (mt?.split('/')[1] || 'bin').replace(/;.*$/, '').slice(0, 8);
    const tempPath = path.join('/tmp', `voip-audio-${Date.now()}-${Math.random().toString(16).slice(2, 8)}.${ext}`);
    fs.writeFileSync(tempPath, buffer);
    return { source: tempPath, tempPath, origin: `replied ${mt?.split('/')[0] || 'audio'}` };
  } catch {
    return { source: 'silence', tempPath: null, origin: 'silence (media download failed)' };
  }
}

export default {
  name: 'call',
  aliases: ['endcall', 'callstatus'],
  category: 'general',
  description: 'Real WhatsApp calls: .call <number|@user> [seconds] (reply to audio to play it into the call), .endcall, .callstatus.',
  cooldown: 15000,
  execute: async ({ sock, m, prefix, args, commandName }) => {
    const p = prefix || '.';

    try {
      if (!isSock(sock) || !sock.authState?.creds?.me?.id) {
        return await m.reply.error('Session is not fully connected — VoIP needs an authenticated session.');
      }

      // ── .callstatus ──────────────────────────────────────────────────
      if (commandName === 'callstatus') {
        const entry = sessions.get(sock);
        if (!entry?.call) return await m.reply.info('No active call on this session.');
        const call = entry.call;
        const secs = Math.max(0, Math.round((Date.now() - call._startedAt) / 1000));
        return await m.reply.success(
          `📞 Active call → *${call._targetLabel || 'target'}* • state ${call.state} • ~${secs}s elapsed`
        );
      }

      // ── .endcall ─────────────────────────────────────────────────────
      if (commandName === 'endcall') {
        const entry = sessions.get(sock);
        if (!entry?.call) return await m.reply.info('No active call to end.');
        const label = entry.call._targetLabel || 'target';
        entry.call.end();
        return await m.reply.success(`📴 Ending call to *${label}*…`);
      }

      // ── .call ────────────────────────────────────────────────────────
      const target = await resolveTarget(sock, m, args, m.from);
      if (!target) {
        return await m.reply.error(
          `Invalid format. Usage: \`${p}call +233XXXXXXXXX [seconds]\` — or mention a user, or reply to their message. Reply to an audio/voice note to play it into the call.`
        );
      }

      const entry = sessions.get(sock);
      if (entry?.call && entry.call.state !== 0 && entry.call.state !== 13) {
        return await m.reply.error(`A call is already active (→ *${entry.call._targetLabel || 'someone'}*). Use \`${p}endcall\` first.`);
      }

      const secsTok = args.map(a => a.replace(/\D/g, '')).filter(Boolean).find(a => a.length <= 3 && +a >= MIN_SECONDS);
      const seconds = Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, +(secsTok || DEFAULT_SECONDS)));

      const audio = await resolveAudioSource(m);

      // First run boots the 9.8MB WASM engine — give the user a heads-up.
      if (!sessions.get(sock)) {
        await m.reply.info('🔄 Booting the VoIP engine (~2–5s, first time only this session)…');
      }

      const session = await getVoipSession(sock);
      session.call = null; // previous call object has ended

      const call = await session.voip.call(target.number, {
        durationMs: seconds * 1000,
        audioSource: audio.source
      });
      call._targetLabel = target.label;
      call._startedAt = Date.now();
      session.call = call;

      const notify = (text) => sock.sendMessage(m.from, { text }).catch(() => {});
      call.on('connected', () => notify(`✅ *${target.label}* answered — call is live (${audio.origin === 'silence' ? 'silent' : 'playing ' + audio.origin}).`));
      call.on('ringing', () => notify(`🔔 ${target.label} is ringing…`));
      call.on('ended', (reason) => {
        const dur = Math.round((Date.now() - call._startedAt) / 1000);
        notify(`📴 Call to *${target.label}* ended (${reason}) — lasted ~${dur}s.`);
        if (audio.tempPath) { try { fs.unlinkSync(audio.tempPath); } catch { /* ok */ } }
        if (session.call === call) session.call = null;
      });

      return await m.reply.success(
        `📞 Calling *${target.label}* — rings as a real WhatsApp call${audio.origin !== 'silence' ? ` (will play ${audio.origin})` : ''}. Auto-ends in ${seconds}s. \`${p}endcall\` to hang up.`
      );
    } catch (e) {
      // Stale/closed engine → drop the cached session so the next attempt reboots it.
      if (/Not connected|engine|Engine|WASM/i.test(String(e?.message))) dropVoipSession(sock);
      return await m.reply.error(`VoIP error: ${String(e?.message || e).slice(0, 180)}`);
    }
  }
};
