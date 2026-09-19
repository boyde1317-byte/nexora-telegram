import { downloadMediaMessage, getContentType } from 'baileys';
import baileysBridge from './baileysBridge.js';
import { config } from '../../config/index.js';
import { messageFormatter } from '../ui/messageFormatter.js';
import { db } from '../database/db.js';
import { withChannelPill } from '../lib/menuContext.js';
import { buildEnrichedContextInfo } from '../lib/enrichContext.js';

/**
 * Extracts the body text from a raw message content object.
 */
function extractBody(type, msgContent) {
  if (!msgContent) return '';

  switch (type) {
    case 'conversation':
      return typeof msgContent === 'string' ? msgContent : (msgContent || '');
    case 'extendedTextMessage':
      return msgContent.text || '';
    case 'imageMessage':
    case 'videoMessage':
    case 'documentMessage':
      return msgContent.caption || '';
    case 'documentWithCaptionMessage':
      return msgContent.message?.documentMessage?.caption || '';
    case 'buttonsResponseMessage':
      return msgContent.selectedButtonId || '';
    case 'listResponseMessage':
      return msgContent.singleSelectReply?.selectedRowId || '';
    case 'templateButtonReplyMessage':
      return msgContent.selectedId || '';
    case 'interactiveResponseMessage': {
      try {
        const parsed = JSON.parse(msgContent.nativeFlowResponseMessage?.paramsJson || '{}');
        return parsed.id || '';
      } catch {
        return '';
      }
    }
    case 'ephemeralMessage':
      // Unwrap disappearing message envelope
      return extractBody(
        Object.keys(msgContent.message || {})[0] || '',
        Object.values(msgContent.message || {})[0]
      );
    case 'viewOnceMessage':
    case 'viewOnceMessageV2': {
      // Unwrap view-once envelope — body is usually empty for commands but expose it
      const inner = msgContent.message || {};
      const innerType = Object.keys(inner)[0] || '';
      return extractBody(innerType, inner[innerType]);
    }
    // ── New message types added by boyde1317-byte/baileys fork ─────────────
    case 'stickerPackMessage':
      // Pack name is the closest thing to a body for sticker packs
      return msgContent.title || msgContent.name || '';
    case 'lottieStickerMessage':
      // Animated sticker — no text body
      return '';
    case 'pollResultSnapshotMessage':
      // Poll result — expose the question text if present
      return msgContent.name || '';
    case 'groupStatusMessageV2':
    case 'spoilerMessage':
      // Wrapper types — unwrap and extract from inner message
      if (msgContent.message) {
        const innerType = Object.keys(msgContent.message)[0] || '';
        return extractBody(innerType, msgContent.message[innerType]);
      }
      return '';
    case 'botForwardedMessage': {
      // Rich message from Meta AI or NEXORA's rich generators — parse into text
      // parseRichMessage expects { botForwardedMessage: { message: ... } }
      // but msgContent IS the botForwardedMessage value, so wrap it.
      const wrapped = { botForwardedMessage: msgContent };
      const parsed = baileysBridge.parseRichMessage(wrapped);
      if (parsed.isRich) return parsed.text || '';
      // Fall back to inner message if no rich content
      if (msgContent.message) {
        const innerType = Object.keys(msgContent.message)[0] || '';
        return extractBody(innerType, msgContent.message[innerType]);
      }
      return '';
    }
    default:
      return '';
  }
}

/**
 * Safely normalise a raw JID that might have a device suffix (:14) or be undefined.
 * Preserves the original domain (e.g. @s.whatsapp.net, @lid, @g.us).
 */
function normaliseJid(raw) {
  if (!raw) return '';
  if (!raw.includes(':')) return raw;
  // Strip the device suffix (e.g. "number:14@s.whatsapp.net" → "number@s.whatsapp.net")
  // but keep whatever domain was originally present.
  const atIdx = raw.lastIndexOf('@');
  const domain = atIdx !== -1 ? raw.slice(atIdx) : '@s.whatsapp.net';
  const user   = (atIdx !== -1 ? raw.slice(0, atIdx) : raw).split(':')[0];
  return user + domain;
}

/**
 * Resolve a JID to its phone-number JID form, following LID → PN mappings when
 * the given JID is an opaque LID.
 *
 * WHY: `sock.contacts` is never populated in this codebase (no in-memory store
 * is attached, no `contacts.upsert`/`contacts.update` listener), so any LID
 * resolution that depended on it silently failed 100% of the time. The Baileys
 * fork ships a real LID↔PN bridge on the socket itself — `sock.signalRepository
 * .lidMapping` — which is populated from the encrypted session data regardless
 * of whether a contact store exists. That is the correct source of truth.
 *
 * @param {object} sock  Baileys socket (needs `signalRepository.lidMapping`)
 * @param {string} jid   JID or LID to resolve
 */
export async function resolvePhoneJid(sock, jid) {
  const norm = normaliseJid(jid);
  if (!norm || !norm.endsWith('@lid')) return norm;
  try {
    const pn = await sock?.signalRepository?.lidMapping?.getPNForLID(norm);
    const pnJid = typeof pn === 'string' ? pn : (pn?.pn || pn?.jid || pn?.id || '');
    if (pnJid) return normaliseJid(pnJid);
  } catch (_) {
    // lidMapping lookup can throw if the session has no record yet — fall through.
  }
  return norm;
}

/**
 * Resolve a JID to its opaque-LID form, following PN → LID mappings when the
 * given JID is a phone-number JID. Mirror of {@link resolvePhoneJid}.
 */
async function resolveLidJid(sock, jid) {
  const norm = normaliseJid(jid);
  if (!norm || !norm.endsWith('@s.whatsapp.net')) return norm;
  try {
    const lid = await sock?.signalRepository?.lidMapping?.getLIDForPN(norm);
    const lidJid = typeof lid === 'string' ? lid : (lid?.lid || lid?.jid || lid?.id || '');
    if (lidJid) return normaliseJid(lidJid);
  } catch (_) {
    // No mapping stored yet — fall through.
  }
  return norm;
}

/**
 * Find a participant in the group metadata by JID, handling LID ↔ phone-JID mismatches.
 *
 * Modern WhatsApp may identify the same user differently in message keys vs group
 * participant lists — one side uses a phone JID (number@s.whatsapp.net) and the
 * other uses an opaque LID (opaqueid@lid). A plain === comparison always fails in
 * that situation, so we resolve through Baileys' real LID↔PN bridge
 * (`sock.signalRepository.lidMapping`) in both directions, falling back to
 * `sock.contacts` only as a last resort for older/base Baileys builds that may
 * populate it.
 *
 * @param {Array}  participants  meta.participants array
 * @param {string} targetJid     JID or LID to look up
 * @param {object} sock          Baileys socket
 */
async function findParticipant(participants, targetJid, sock) {
  const norm = normaliseJid(targetJid);

  // 1. Direct normalised match (fast path — works when both sides use the same format)
  const direct = participants.find(p => normaliseJid(p.id) === norm);
  if (direct) return direct;

  // 1.5 Direct phoneNumber/lid field match — WhatsApp's group participant nodes
  // already carry this bridge (phone_number/lid attrs, see groups.js), no
  // session/signalRepository lookup needed. Cheaper and more reliable than
  // step 2/3 below, which depend on an established Signal session existing.
  const byField = participants.find(p =>
    (p.phoneNumber && normaliseJid(p.phoneNumber) === norm) ||
    (p.lid && normaliseJid(p.lid) === norm)
  );
  if (byField) return byField;

  const contacts = sock?.contacts || {};

  // 2. LID → phone JID (authoritative: signalRepository; fallback: contacts store)
  if (norm.endsWith('@lid')) {
    const viaRepo = await resolvePhoneJid(sock, norm);
    if (viaRepo !== norm) {
      const byRepo = participants.find(p => normaliseJid(p.id) === viaRepo);
      if (byRepo) return byRepo;
    }
    const contact = Object.values(contacts).find(
      c => normaliseJid(c.lid || '') === norm || normaliseJid(c.id || '') === norm
    );
    if (contact) {
      const phoneJid = normaliseJid(contact.jid || contact.id || '');
      if (phoneJid && phoneJid !== norm) {
        const byPhone = participants.find(p => normaliseJid(p.id) === phoneJid);
        if (byPhone) return byPhone;
      }
    }
  }

  // 3. Phone JID → LID (authoritative: signalRepository; fallback: contacts store)
  if (norm.endsWith('@s.whatsapp.net')) {
    const viaRepo = await resolveLidJid(sock, norm);
    if (viaRepo !== norm) {
      const byRepo = participants.find(p => normaliseJid(p.id) === viaRepo);
      if (byRepo) return byRepo;
    }
    const contact = contacts[norm];
    if (contact?.lid) {
      const lidNorm = normaliseJid(contact.lid);
      const byLid = participants.find(p => normaliseJid(p.id) === lidNorm);
      if (byLid) return byLid;
    }
  }

  return null;
}

/**
 * Resolve whether a sender JID belongs to the configured bot owner(s),
 * following LID → phone-number resolution so owner checks keep working when
 * WhatsApp presents the owner's own account as an opaque LID instead of a
 * phone-number JID (common with privacy settings on newer accounts).
 */
async function resolveIsOwner(sock, senderJid, fromMe, groupJid) {
  // Extra linked sessions (.pair, see sessionManager.js): the session's OWN
  // account is that session's owner — everything the paired number's owner
  // types arrives fromMe on its companion socket, so fromMe ⇒ owner there.
  if (fromMe && sock?._nexoraExtraSession) return true;

  const botNumber = sock?.user?.id?.split('@')[0]?.split(':')[0];
  const botIsOwner = !!(botNumber && config.owner.includes(botNumber));
  if (fromMe && botIsOwner) return true;

  // fromMe ⇒ the message came from the linked account itself. On fresh
  // pairing-code links sock.user.id can present as an opaque LID, so the
  // check above silently fails and the owner gets denied on their OWN
  // commands ("Bot responds" with owner_only/private_mode canned text,
  // commands never run). But the linked account is by definition the
  // PAIRING_PHONE account — pairing requires it to be in OWNER_NUMBERS —
  // so anchor the fromMe check on the pairing number instead.
  if (fromMe && config.pairing?.phoneNumber) {
    const pairNum = config.pairing.phoneNumber.replace(/[^0-9]/g, '');
    if (pairNum && config.owner.includes(pairNum)) return true;
  }

  const num = await resolveSenderNumber(sock, senderJid, groupJid);
  if (num && config.owner.includes(num)) return true;

  return false;
}

/**
 * Resolve the best-known phone number for a sender JID, shared by the owner
 * and super-owner checks:
 *  1. non-LID jids carry the number directly;
 *  2. group metadata bridge — WhatsApp sends phone_number/lid attrs directly
 *     on each participant node (see groups.js), so the sender's real number
 *     resolves even when NO Signal session exists yet for their LID. This is
 *     the failure mode that broke owner checks: a fresh/newly-active group
 *     presents the sender as an opaque LID with no signalRepository mapping.
 *     Group metadata doesn't need a session — it's always there.
 *  3. LID → phone via signalRepository (authoritative) as the last resort.
 * Returns null when the number cannot be determined yet.
 */
async function resolveSenderNumber(sock, senderJid, groupJid) {
  const norm = normaliseJid(senderJid);
  const rawNumber = norm.split('@')[0];
  if (!norm.endsWith('@lid')) return rawNumber;

  if (groupJid) {
    try {
      const meta = await sock.groupMetadata(groupJid);
      const p = meta?.participants?.find(part => normaliseJid(part.id) === norm);
      if (p?.phoneNumber) return p.phoneNumber.replace(/[^0-9]/g, '');
    } catch (_) {
      // groupMetadata can fail if the bot isn't in the group or is rate-limited
    }
  }

  const phoneJid = await resolvePhoneJid(sock, norm);
  if (phoneJid !== norm) return phoneJid.split('@')[0];
  return null;
}

/**
 * Super owner check (see config SUPER_OWNER_NUMBERS). The super owner can log
 * out every paired session (.logoutall) and unpair any session individually.
 * fromMe counts ONLY on the main socket — on an extra session fromMe is that
 * session's own owner, who is NOT the super owner by definition.
 */
async function resolveIsSuperOwner(sock, senderJid, fromMe, groupJid) {
  if (fromMe && !sock?._nexoraExtraSession) {
    const botNumber = sock?.user?.id?.split('@')[0]?.split(':')[0];
    if (botNumber && config.superOwner.includes(botNumber)) return true;
    if (config.pairing?.phoneNumber) {
      const pairNum = config.pairing.phoneNumber.replace(/[^0-9]/g, '');
      if (pairNum && config.superOwner.includes(pairNum)) return true;
    }
  }

  const num = await resolveSenderNumber(sock, senderJid, groupJid);
  if (num && config.superOwner.includes(num)) return true;
  return false;
}

/**
 * Serialise a raw Baileys message into a convenient `m` object with
 * helper methods (.reply, .react, .edit, .delete, .download).
 *
 * @param {object} rawMessage  Raw Baileys message
 * @param {import('baileys').WASocket} sock
 * @returns {Promise<object|null>}
 */
export async function serialize(rawMessage, sock) {
  if (!rawMessage?.message || !rawMessage?.key?.remoteJid) return null;

  // ── Content-type resolution ──────────────────────────────────────────────
  // MUST use the fork's getContentType (same as Moonson's reference
  // handler), NOT Object.keys(message)[0]. Native-flow responses — e.g.
  // tapping a single_select pill — arrive as:
  //
  //   { messageContextInfo: {...}, interactiveResponseMessage: {...} }
  //
  // where messageContextInfo is often the FIRST key. Taking the raw first
  // key typed the message as 'messageContextInfo', extractBody found no
  // case for it, the body came back empty — and selected pills never
  // triggered their command. getContentType skips protocol keys and
  // returns the real content type ('interactiveResponseMessage').
  // Fallback to the first key keeps behavior identical for every other
  // message shape.
  const type = getContentType(rawMessage.message) || Object.keys(rawMessage.message)[0] || '';
  const msgContent = rawMessage.message[type];
  const jid = rawMessage.key.remoteJid;

  const message = {
    // ── Identity ──────────────────────────────────────────────────────────
    key: rawMessage.key,
    id: rawMessage.key.id,
    from: jid,
    sender: normaliseJid(rawMessage.key.participant || (rawMessage.key.fromMe ? sock.user?.id : '') || jid),
    fromMe: rawMessage.key.fromMe || false,
    isGroup: jid.endsWith('@g.us'),
    isStatus: jid === 'status@broadcast',
    isNewsletter: jid.endsWith('@newsletter'),

    // ── Content ────────────────────────────────────────────────────────────
    type,
    // Raw proto content (the WAMessage `message` field). MUST be exposed:
    // the serialized object is passed as { quoted: m } in nearly every
    // send path, and the fork's generateWAMessageFromContent reads
    // quoted.message — without this, the quoted branch dereferences
    // undefined[undefined] and every quoted send crashes with
    // "Cannot read properties of undefined (reading 'undefined')".
    message: rawMessage.message,
    msg: msgContent,
    body: '',
    hasMedia: false,
    hasQuotedMsg: false,

    // ── Metadata ──────────────────────────────────────────────────────────
    timestamp: (rawMessage.messageTimestamp || Date.now()) * 1000,
    sock,

    // ── Group metadata cache ──────────────────────────────────────────────
    _groupMeta: null,
    getGroupMetadata: async () => {
      if (message._groupMeta) return message._groupMeta;
      if (!message.isGroup) return null;
      try {
        message._groupMeta = await sock.groupMetadata(jid);
      } catch (_) {
        message._groupMeta = null;
      }
      return message._groupMeta;
    },
  };

  // Resolve owner status (async, cached on first call)
  message._isOwner = undefined;
  Object.defineProperty(message, 'isOwner', {
    get() {
      if (message._isOwner !== undefined) return Promise.resolve(message._isOwner);
      return resolveIsOwner(sock, message.sender, message.fromMe, message.isGroup ? jid : null).then(result => {
        message._isOwner = result;
        return result;
      });
    },
  });

  // Super owner tier (.logoutall / unpair-any powers) — see resolveIsSuperOwner.
  message._isSuperOwner = undefined;
  Object.defineProperty(message, 'isSuperOwner', {
    get() {
      if (message._isSuperOwner !== undefined) return Promise.resolve(message._isSuperOwner);
      return resolveIsSuperOwner(sock, message.sender, message.fromMe, message.isGroup ? jid : null).then(result => {
        message._isSuperOwner = result;
        return result;
      });
    },
  });

  // Extract body text
  message.body = extractBody(type, msgContent);

  // Detect quoted message
  if (msgContent?.contextInfo?.quotedMessage || msgContent?.contextInfo?.stanzaId) {
    message.hasQuotedMsg = true;
    const q = msgContent.contextInfo;
    message.quoted = {
      key: {
        id: q.stanzaId,
        remoteJid: q.remoteJid || jid,
        participant: normaliseJid(q.participant || ''),
        fromMe: normaliseJid(q.participant || '') === normaliseJid(sock.user?.id || ''),
      },
      sender: normaliseJid(q.participant || ''),
      message: q.quotedMessage || {},
      type: q.quotedMessage ? Object.keys(q.quotedMessage)[0] : '',
      body: q.quotedMessage ? extractBody(Object.keys(q.quotedMessage)[0], Object.values(q.quotedMessage)[0]) : '',
      download: async () => {
        if (!q.quotedMessage) return null;
        const fakeMsg = { message: q.quotedMessage, key: { id: q.stanzaId, remoteJid: q.remoteJid || jid, participant: q.participant } };
        return await downloadMediaMessage(fakeMsg, 'buffer', {});
      },
    };
  }

  // Detect media
  const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage', 'pttMessage'];
  if (mediaTypes.includes(type) || (type === 'documentWithCaptionMessage' && msgContent?.message?.documentMessage)) {
    message.hasMedia = true;
  }

  // ── Admin helpers (async, cached) ─────────────────────────────────────────
  message.isAdmin = async () => {
    if (!message.isGroup) return false;
    const meta = await message.getGroupMetadata();
    if (!meta) return false;
    const p = await findParticipant(meta.participants, message.sender, sock);
    return !!(p && (p.admin === 'admin' || p.admin === 'superadmin'));
  };

  message.isBotAdmin = async () => {
    if (!message.isGroup) return false;
    const meta = await message.getGroupMetadata();
    if (!meta) return false;
    const botJid = normaliseJid(sock.user?.id);
    const p = await findParticipant(meta.participants, botJid, sock);
    return !!(p && (p.admin === 'admin' || p.admin === 'superadmin'));
  };

  // ── Reply helper ──────────────────────────────────────────────────────────
  // Automatically attaches an externalAdReply preview card (link-preview
  // banner with bot logo + source URL) to every text-only reply, controlled
  // by config.features.adReplyCards (default: true).
  //
  // Callers can still override by passing their own contextInfo:
  //   m.reply(text)                                    // auto-attaches ad-reply card
  //   m.reply(text, { contextInfo: customContextInfo }) // uses caller's contextInfo
  //   m.reply(text, { skipAdReply: true })               // force-skip the card
  const replyFn = async (text, options = {}) => {
    const { contextInfo, skipAdReply, skipPill, ...sendOptions } = options;
    message._replyCount = (message._replyCount || 0) + 1;

    // Auto-attach externalAdReply card when:
    //   1. Feature flag is enabled
    //   2. Caller didn't pass their own contextInfo
    //   3. Caller didn't explicitly skip it
    let finalContextInfo = contextInfo;
    if (!finalContextInfo && !skipAdReply && config.features?.adReplyCards !== false) {
      try {
        finalContextInfo = await buildEnrichedContextInfo();
      } catch (_) {
        // enrichContext build failed — send bare text, never break the reply
      }
    }

    // Channel pill (forwardedNewsletterMessageInfo) stacks on plain,
    // non-interactive replies too — same Yuzuki-style single message.
    // Callers can opt out with { skipPill: true }.
    if (!skipPill) {
      try {
        finalContextInfo = withChannelPill(finalContextInfo);
      } catch (_) {
        // pill helper failed — keep the reply alive
      }
    }

    return await sock.sendMessage(
      message.from,
      { text, ...(finalContextInfo ? { contextInfo: finalContextInfo } : {}) },
      { quoted: message, ...sendOptions }
    );
  };

  replyFn.success = async (text, options = {}) =>
    replyFn(messageFormatter.success(text), options);
  replyFn.error   = async (text, options = {}) =>
    replyFn(messageFormatter.error(text), options);
  replyFn.warn    = async (text, options = {}) =>
    replyFn(messageFormatter.warn(text), options);
  replyFn.info    = async (text, title = 'INFO', options = {}) =>
    replyFn(messageFormatter.info(text, title), options);
  replyFn.loading = async (text = 'Processing...', options = {}) =>
    replyFn(messageFormatter.loading(text), options);

  message.reply = replyFn;

  // ── React helper ──────────────────────────────────────────────────────────
  message.react = async (emoji) => {
    return await sock.sendMessage(message.from, {
      react: { text: emoji, key: message.key }
    });
  };

  // ── Edit helper ───────────────────────────────────────────────────────────
  message.edit = async (newText) => {
    return await sock.sendMessage(message.from, {
      text: newText,
      edit: message.key
    });
  };

  // ── Delete helper ─────────────────────────────────────────────────────────
  message.delete = async () => {
    return await sock.sendMessage(message.from, { delete: message.key });
  };

  // ── Media download helper ─────────────────────────────────────────────────
  message.download = async () => {
    if (!message.message) return null;
    return await downloadMediaMessage(message, 'buffer', {});
  };

  return message;
}

export default serialize;
