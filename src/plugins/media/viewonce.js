import { resolveDisplayIdentity, mentionChip } from '../../lib/identity.js';

/**
 * viewonce.js — 👁️ View Once reader.
 *
 * Reply to a one-view photo/video/voice note with .vv and the bot
 * re-sends it as normal media that stays in the chat. Unlike .save
 * (a generic media extractor), this is strict: it only touches actual
 * view-once envelopes, and it unwraps every nesting WhatsApp uses —
 * viewOnceMessage, viewOnceMessageV2, viewOnceMessageV2Extension
 * (what current clients send for one-view photos/videos/voice notes)
 * and view-once wrapped inside ephemeralMessage / editedMessage /
 * documentWithCaptionMessage.
 *
 * Privacy gate: in groups only admins (and the owner) may reveal —
 * a view-once is usually aimed at one person. In DMs anyone can use
 * it, since the chat participants are the only audience.
 */
const MEDIA_TYPES = ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'];

// one-view envelope types — V2Extension is what current WhatsApp clients
// actually send (voice notes and most photos/videos since 2025)
const VO_ENVELOPES = ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension'];
// pass-through wrappers that can sit AROUND the view-once envelope
const PASS_THROUGH = ['ephemeralMessage', 'editedMessage', 'documentWithCaptionMessage'];

/**
 * Walk up to 5 layers to find the view-once inner media. Only content
 * behind an actual view-once envelope counts; bare media returns null.
 * Fallback: legacy top-level media flagged viewOnce/viewOnceV2.
 */
function unwrapViewOnce(message) {
  let node = message;
  let sawViewOnce = false;
  for (let depth = 0; node && depth < 5; depth++) {
    const type = Object.keys(node)[0];
    const inner = node[type];
    if (VO_ENVELOPES.includes(type)) {
      sawViewOnce = true;
      node = inner?.message;
      continue;
    }
    if (PASS_THROUGH.includes(type)) {
      node = inner?.message;
      continue;
    }
    if (sawViewOnce) {
      for (const t of MEDIA_TYPES) {
        if (node[t]) return { type: t, msg: node[t], isViewOnce: true };
      }
      return null; // view-once without known media (e.g. location)
    }
    // already-unwrapped media — not a view-once at all
    return null;
  }
  return null;
}

/** Legacy view-once: bare top-level media with a view-once flag set. */
function unwrapLegacyViewOnce(message) {
  for (const t of MEDIA_TYPES) {
    const inner = message?.[t];
    if (inner && (inner.viewOnce || inner.viewOnceV2 || inner.viewOnceV2Extension)) {
      return { type: t, msg: inner, isViewOnce: true };
    }
  }
  return null;
}

export default {
  name: 'viewonce',
  aliases: ['vv', 'reveal', 'readonce'],
  category: 'media',
  description: 'View Once reader — reply to a view-once message to reveal it. Usage: .vv (reply)',
  cooldown: 5000,
  execute: async ({ sock, m, prefix }) => {
    const p = prefix || '.';

    if (!m.quoted) {
      return await m.reply.warn(`Reply to a view-once photo, video or voice note with \`${p}vv\` to reveal it.`);
    }

    // privacy gate: groups → admins + owner only
    if (m.isGroup) {
      const isAdmin = await m.isAdmin();
      const isOwner = await m.isOwner;
      if (!isAdmin && !isOwner) {
        return await m.reply.warn('Only group admins can reveal view-once media here.');
      }
    }

    const found = unwrapViewOnce(m.quoted.message || {}) || unwrapLegacyViewOnce(m.quoted.message || {});
    if (!found) {
      return await m.reply.warn('That message is not view-once media. Reply to a 👁️ one-view photo/video/voice note.');
    }

    await m.react('⏳');
    try {
      const buffer = await m.quoted.download();
      if (!buffer || !buffer.length) {
        await m.react('❌');
        return await m.reply.error('Download failed — the media may have expired from WhatsApp servers.');
      }

      const voId = await resolveDisplayIdentity(sock, (m.quoted.sender || m.quoted.participant || ''), m.isGroup ? m.from : null);
      const caption = `👁️ *View Once Revealed* — from ${voId.number ? '+' + voId.number : voId.label}`;

      let payload;
      if (found.type === 'imageMessage')       payload = { image: buffer, caption };
      else if (found.type === 'videoMessage')  payload = { video: buffer, caption };
      else if (found.type === 'audioMessage')  payload = { audio: buffer, mimetype: found.msg?.mimetype || 'audio/mp4', ptt: found.msg?.ptt || false };
      else if (found.type === 'stickerMessage') payload = { sticker: buffer };
      else payload = { document: buffer, mimetype: found.msg?.mimetype || 'application/octet-stream', fileName: found.msg?.fileName || 'viewonce', caption };

      await sock.sendMessage(m.from, payload, { quoted: m });
      await m.react('👁️');
    } catch (err) {
      await m.react('❌');
      await m.reply.error(`Could not reveal the media: ${err.message}`);
    }
  },
};

// exported for the test kit (.testrich suite)
export { unwrapViewOnce, unwrapLegacyViewOnce };
