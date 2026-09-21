/**
 * device.js — device info check for a WhatsApp account.
 *
 * Shows everything OBSERVED about an account's device footprint:
 *   - which device index the account sends from (0 = primary phone,
 *     N>0 = a linked device: web, desktop, or a linked-bot bridge —
 *     Baileys bots connect as linked devices, so a "member" who only
 *     ever posts from device 3 is worth a second look)
 *   - last message id prefix + sender-key encryption presence
 *   - last message type and how long ago they were last seen
 *   - live lookups: exists on WhatsApp, verified business name, About
 *     text, profile picture, group role
 *
 * Usage:
 *   .device                — check yourself
 *   .device @user          — check a mentioned member
 *   .device (reply)        — check the replied-to sender
 *   .device 233533416608   — check a bare number
 *   .device <lid digits>   — LIDs resolve through the LID→PN bridge and
 *                            group-participant matching (no more blank cards)
 *
 * Great companion to .antibot — spot the accounts hiding behind a
 * linked device bridge before trusting them.
 */
import { richTableCard, mixedCard } from '../../lib/interactiveKit.js';
import { getDeviceInfo, lastSeenAgo } from '../../lib/deviceCache.js';
import { resolveDisplayIdentity } from '../../lib/identity.js';

const withTimeout = (p, ms = 8000) => Promise.race([p, new Promise((r) => setTimeout(r, ms, null))]);
const fmtAgo = (ms) => {
  if (ms === null) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export default {
  name: 'device',
  aliases: ['devinfo', 'deviceinfo'],
  category: 'utility',
  description: 'Device info check: linked-device index, sender-key, business name, about & more. Usage: .device [@user | reply | number]',
  cooldown: 5000,
  execute: async ({ m, sock, args }) => {

    // ── resolve target ──────────────────────────────────────────────────────
    let target = m.msg?.contextInfo?.mentionedJid?.[0]
      || m.quoted?.sender
      || null;
    const rawArg = (args[0] || '').trim();
    const rawNum = rawArg.replace(/[^0-9]/g, '');
    if (!target && rawNum && rawNum.length >= 7) {
      const isLidArg = /@lid/i.test(rawArg) || rawNum.length >= 16;
      target = `${rawNum}${isLidArg ? '@lid' : '@s.whatsapp.net'}`;
    }
    if (!target) target = m.sender;

    // ── LID-space handling ───────────────────────────────────────────────────
    // Typed/replied LIDs keep their @lid domain — coercing them to a phone JID
    // makes every downstream lookup fail (the old 'lame card' bug). Group
    // participants are matched by their LID digits too, so a pasted LID from
    // this chat resolves to the member's full identity.
    const isLidTarget = /@lid/i.test(target);
    const rawUser = target.split('@')[0].split(':')[0];
    let norm = `${rawUser}${isLidTarget ? '@lid' : '@s.whatsapp.net'}`;
    let participantMatch = null;

    if (m.isGroup) {
      const metaEarly = await m.getGroupMetadata().catch(() => null);
      const parts = metaEarly?.participants || [];
      const matches = parts.find((x) => {
        const ids = [x.id, x.jid, x.lid].filter((i) => typeof i === 'string' && i.includes('@'));
        return ids.some((i) => i.split('@')[0].split(':')[0] === rawUser);
      });
      if (matches) {
        participantMatch = matches;
        const mid = typeof matches.id === 'string' && matches.id.includes('@') ? matches.id
          : (typeof matches.jid === 'string' && matches.jid.includes('@') ? matches.jid
          : (typeof matches.lid === 'string' && matches.lid.includes('@') ? matches.lid : norm));
        const at = mid.lastIndexOf('@');
        norm = at > 0 ? `${mid.slice(0, at).split(':')[0]}${mid.slice(at)}` : norm;
        target = mid;
      }
    }

    // LID → phone-number bridge (returns real number + @username when the
    // bot has signal records for them; falls back silently otherwise)
    const disp = await resolveDisplayIdentity(sock, norm);
    const phoneJid = disp.phoneJid || null;       // real @s.whatsapp.net when mapped
    const lookupJid = phoneJid || norm;           // run live lookups here
    const num = disp.number || rawUser;           // display number (real one when resolved)

    // ── observed data (device cache) ────────────────────────────────────────
    const dev = getDeviceInfo(norm) || getDeviceInfo(phoneJid || norm) || getDeviceInfo(target);

    // ── live lookups — each independent, none fatal ────────────────────────
    const [waInfo, status, pfp, meta] = await Promise.all([
      withTimeout(sock.onWhatsApp?.(lookupJid).catch(() => null)).then((r) => r?.[0] || null),
      withTimeout(sock.fetchStatus?.(lookupJid).catch(() => null)),
      withTimeout(sock.profilePictureUrl?.(lookupJid, 'url').catch(() => null)),
      m.isGroup ? m.getGroupMetadata().catch(() => null) : Promise.resolve(null),
    ]);

    const exists   = waInfo ? (Array.isArray(waInfo) ? waInfo : [waInfo])[0]?.exists : null;
    const bizName  = waInfo?.verifiedName || waInfo?.verifiedBizName || '';
    const about    = status?.status?.status?.toString().trim() || status?.status?.toString().trim() || '';
    const part     = participantMatch
      || meta?.participants?.find((x) => {
          const ids = [x.id, x.jid, x.lid].filter((i) => typeof i === 'string' && i.includes('@'));
          return ids.some((i) => i.split('@')[0].split(':')[0] === num);
        });
    const role     = part ? (part.admin ? (part.admin === 'superadmin' ? 'Owner (superadmin)' : 'Admin') : 'Member') : (m.isGroup ? 'Not in this group' : '—');

    // ── verdict hints (observed only) ────────────────────────────────────────
    const hints = [];
    if (isLidTarget && !disp.number) {
      hints.push("target is an LID the bot has not mapped yet — they need to message or appear in a shared chat for the real number to surface");
    }
    if (dev) {
      if (dev.deviceIndex !== null && dev.deviceIndex > 0) {
        hints.push(`sends from linked device #${dev.deviceIndex}, not the primary phone`);
      }
      if (!dev.hasSenderKey && dev.hasDeviceListMeta === false) {
        hints.push('no sender-key encryption observed yet');
      }
    } else {
      hints.push('no message from this account observed since the bot booted');
    }
    if (!pfp) hints.push('no profile picture');
    if (exists === false) hints.push('not registered on WhatsApp');

    // ── card ────────────────────────────────────────────────────────────────
    const displayLabel = disp.number
      ? `+${num}`
      : (isLidTarget ? 'unresolved LID (bot hasn\'t seen their real number)' : `+${num}`);
    const rows = [
      ['👤 Name',        dev?.pushName || m.quoted?.pushName || participantMatch?.name || '—'],
      ['🪪 Username',    disp.username ? `@${disp.username}` : 'not set / unknown'],
      ['📱 Number',      displayLabel],
      ['✅ On WhatsApp',  exists === null ? 'unknown (lookup failed)' : (exists ? 'yes' : 'NO — not registered')],
      ['🏪 Business',    bizName || 'not a verified business'],
      ['💬 About',       about ? about.slice(0, 60) : 'not set'],
      ['🖼️ Picture',    pfp ? 'set' : 'NOT SET'],
      ['🏅 Group role',  role],
      ['📟 Device index', dev ? (dev.deviceIndex === null ? 'not observed' : `#${dev.deviceIndex} ${dev.deviceIndex === 0 ? '(primary phone)' : '(linked device)'}`) : 'not observed'],
      ['🔐 Sender-key',  dev ? (dev.hasSenderKey ? 'yes (modern app session)' : 'not observed yet') : '—'],
      ['🆔 Last msg id', dev ? `${dev.msgIdPrefix}…` : '—'],
      ['📡 Last type',   dev?.lastType || '—'],
      ['🕒 Last seen',   fmtAgo(lastSeenAgo(norm) ?? lastSeenAgo(target) ?? lastSeenAgo(phoneJid))],
    ];

    await richTableCard(sock, m.from, {
      title: `📟 DEVICE INFO — ${disp.number ? '+' + num : (disp.label !== 'hidden account (LID)' ? disp.label : 'LID target')}`,
      headers: ['Field', 'Value'],
      rows,
      footer: hints.length ? `⚠️ ${hints.join('; ')}` : '✅ nothing unusual observed',
    }, { quoted: m });

    if (pfp) {
      await mixedCard(sock, m.from, {
        text: `📟 *Profile picture of ${disp.number ? '+' + num : disp.label}*\n\nTap to open in full size.`,
        footer: 'NEXORA • Device Info',
      }, [
        { kind: 'url',  label: '🖼️ Open Picture', value: pfp },
        ...(disp.number ? [
          { kind: 'url',  label: '💬 Open Chat',      value: `https://wa.me/${num}` },
          { kind: 'copy', label: '📋 Copy Number',   value: `+${num}` },
        ] : []),
      ], { quoted: m });
    }
  },
};
