/**
 * sessionManager.js — additional linked WhatsApp sessions for the bot.
 *
 * `.pair <number>` spawns a fresh baileys socket with its own auth folder
 * (session/extras/<phone>/), requests a pairing code for the OTHER number,
 * and — once the code is entered on that phone — the paired number comes
 * online as a full second NEXORA instance: same plugin dispatcher
 * (handleMessage), same group-event handler, same rich-message stack.
 *
 * Design notes:
 *  - Socket presentation mirrors the main connection exactly (Moonson-proven
 *    macOS/Safari browser tuple, latest WA version, markOnlineOnConnect) —
 *    see src/core/connection.js.
 *  - Pairing codes are requested ONLY after the `qr` event proves the
 *    WebSocket is live (same lesson as the main connection's cold-start race).
 *  - Every socket keeps ONE code per lifetime; a new socket = a new code,
 *    and WA invalidates all older codes.
 *  - creds with a stale (never-completed) link attempt are cleared before a
 *    new pair — stale creds.me otherwise makes every later boot look
 *    "already paired" and no fresh code is ever requested.
 *  - Extra session dirs live under <sessionPath>/extras/<phone>/ so they
 *    inherit the same persistent volume as the main session on every
 *    deployment; the main connection's logged-out wipe skips directories.
 *
 * FULL-BOT MODE (2026-09-14): an extra session is an independent bot for its
 * own account. Everything the paired number's owner types arrives with
 * key.fromMe on their companion socket, so unlike the main connection these
 * sessions PROCESS fromMe — but only in groups and their self-chat, never in
 * their private DMs with other people (no leaking bot replies into the
 * owner's personal conversations). serializer.resolveIsOwner treats the
 * session's own account as that session's owner. Echo and cross-bot loops
 * are blocked by tracking outgoing message ids and skipping messages
 * authored by other linked bots (the main connection does the same for
 * messages authored by extras).
 */
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  Browsers
} from 'baileys';
import pino from 'pino';
import path from 'path';
import fs from 'fs';

import { config } from '../../config/index.js';
import { client } from './client.js';
import { attachOutgoingTracker } from '../lib/outgoingCache.js';
import { copyResultCard } from '../lib/interactiveKit.js';
import { handleMessage } from '../handlers/message.js';
import { resolveSenderNumber } from './serializer.js';
import { isTelegramJid, deliverNotification, mirrorSessionAlert } from '../telegram/bridge.js';
import { handleGroupParticipantsUpdate } from '../handlers/group.js';

const logger = pino({ level: 'silent' });

/** Max simultaneously active extra sessions.
 * TELEGRAM FLEET MODE (2026-09-19): raised 5 → 50 for the Telegram
 * control-panel port. This is a MEMORY-tier decision, not a licensing one:
 * each extra session is a full Baileys socket + auth folder, so 50 live
 * sessions wants roughly 2-4 GB RAM. On a small host lower this via
 * MAX_EXTRA_SESSIONS env (parsed below). */
const MAX_EXTRA_SESSIONS_ENV = parseInt(process.env.MAX_EXTRA_SESSIONS || '', 10);
export const MAX_EXTRA_SESSIONS = Number.isFinite(MAX_EXTRA_SESSIONS_ENV) && MAX_EXTRA_SESSIONS_ENV > 0
  ? Math.min(MAX_EXTRA_SESSIONS_ENV, 50)
  : 50;

/** Window the pairing socket stays open waiting for the code entry. */
const PAIRING_WINDOW_MS = 3 * 60 * 1000;

/** Reconnect backoff for already-linked sessions. */
const RECONNECT_BASE_MS = 5000;
const RECONNECT_MAX_MS = 60000;
const RECONNECT_MAX_ATTEMPTS = 10;

/** Root folder for extra-session auth state. */
function extrasRoot() {
  return path.resolve(config.sessionPath, 'extras');
}

/** Registry of every extra session this process knows about. */
const sessions = new Map(); // phone → entry
let resuming = false;

/** Normalize user input to plain digits (accepts +, spaces, JIDs). Exported
 *  for the session plugins' super-owner guards. */
export function normalizeSessionPhone(raw) {
  return normalizePhone(raw);
}

function sessionDir(phone) {
  return path.join(extrasRoot(), phone);
}

/** Normalize user input to plain digits (accepts +, spaces, JIDs). */
function normalizePhone(raw) {
  return String(raw || '')
    .replace(/@s\.whatsapp\.net/g, '')
    .replace(/[^\d]/g, '');
}

function isRegistered(dir) {
  try {
    const creds = JSON.parse(fs.readFileSync(path.join(dir, 'creds.json'), 'utf8'));
    return Boolean(creds?.registered);
  } catch (_) {
    return false;
  }
}

/** Wipe a session dir (recursive, safe if missing). */
function wipeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_) {}
}

/** Send a status line to the owner via the MAIN socket (never throws).
 * `tg:<chat_id>` targets route to the Telegram control panel instead. */
async function notifyMain(notifyJid, text) {
  try {
    if (!notifyJid) return;
    if (isTelegramJid(notifyJid)) {
      await deliverNotification(notifyJid, text, { parseMode: 'Markdown' });
      return;
    }
    if (client.socket?.user) {
      await client.socket.sendMessage(notifyJid, { text });
    }
  } catch (_) {}
}

/** JID of the first super owner — paired-session lifecycle DMs target them. */
function superOwnerJid() {
  const num = config.superOwner?.[0];
  return num ? `${num}@s.whatsapp.net` : null;
}

/**
 * Send a paired-session STATUS message to the super owner's DM, plus the
 * chat the .pair command ran in (deduped when they're the same chat). The
 * pairing CODE itself must never go through here — it stays in the
 * command chat via notifyMain (secrets don't get duplicated around).
 */
export async function notifyStatus(notifyJid, text) {
  const sj = superOwnerJid();
  if (notifyJid && notifyJid !== sj) await notifyMain(notifyJid, text);
  if (sj) await notifyMain(sj, text);
  // Mirror lifecycle alerts to the owner's Telegram chat when the control
  // panel is running (no-op otherwise; deduped when already delivered there).
  await mirrorSessionAlert(notifyJid, text);
}

/**
 * Phone numbers of every linked bot socket (main + extras), excluding the
 * given one — used by both this module and the main connection to skip
 * messages authored by other linked bots (loop guard).
 */
export function getLinkedBotPhones(excludePhone) {
  const phones = new Set();
  const main = client.socket?.user?.id?.split(':')[0]?.split('@')[0];
  if (main) phones.add(main);
  for (const p of sessions.keys()) phones.add(p);
  phones.delete(excludePhone);
  return [...phones];
}

/** Live online sockets — { phone, sock } for broadcast-style fan-outs. */
export function activeSessionSockets() {
  const out = [];
  for (const [phone, s] of sessions.entries()) {
    if (s.status === 'online' && s.sock) out.push({ phone, sock: s.sock });
  }
  return out;
}

/** List every extra session, active or on-disk. */
export function listSessions() {
  const out = [];
  for (const [phone, s] of sessions.entries()) {
    out.push({
      phone,
      jid: s.jid || null,
      name: s.name || null,
      status: s.status,
      connectedAt: s.connectedAt || null,
      lastError: s.lastError || null,
      active: s.status === 'online',
      pairedBy: s.pairedBy || null,
    });
  }
  return out;
}

/**
 * Read the live pairing state of one phone — powers the free web pairing
 * page (src/web/pairWeb.js). The pairing CODE is returned here and shown
 * only to the web visitor holding the matching polling token; it is never
 * sent over WhatsApp or Telegram for web pairs (no real notifyJid).
 */
export function getPairingState(rawPhone) {
  const phone = normalizePhone(rawPhone);
  const s = sessions.get(phone);
  if (!s) return null;
  return {
    phone,
    status: s.status,
    pairingCode: s.pairingCode || null,
    name: s.name || null,
    lastError: s.lastError || null,
  };
}
/**
 * Build and connect one extra session socket.
 * `phase` is 'pairing' (fresh, waiting for code entry) or 'resume'
 * (creds registered, just reconnecting).
 */
async function spawnSessionSocket(phone, phase, notifyJid) {
  const entry = sessions.get(phone);
  const dir = sessionDir(phone);
  fs.mkdirSync(dir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(dir);

  let version;
  try {
    const { version: v } = await fetchLatestBaileysVersion();
    version = v;
  } catch (_) {
    version = undefined;
  }

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    logger,
    // Same proven presentation as the main connection — see header notes.
    browser: Browsers.macOS('Safari'),
    markOnlineOnConnect: true,
    syncFullHistory: false,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 30000,
    retryRequestDelayMs: 2000,
    messageStore: new Map(),
    getMessage: async (key) => {
      const chat = key?.remoteJid;
      const store = sock.opts?.messageStore;
      const msgs = chat && store ? store.get(chat) : null;
      const msg = msgs ? msgs.get(key.id) : null;
      return msg || { conversation: '' };
    }
  });

  entry.sock = sock;

  // ── Outgoing message tracking (powers .delall) ── same wrapper as main ──
  attachOutgoingTracker(sock);
  entry.reconnectAttempts = entry.reconnectAttempts || 0;

  // ── Full-bot mode markers ────────────────────────────────────────────────
  // serializer.resolveIsOwner and handleMessage's guards key off these.
  sock._nexoraExtraSession = true;
  sock._nexoraSessionPhone = phone;

  // Echo guard: this session processes fromMe, so its own outgoing sends
  // must never re-enter handleMessage (the bot would answer itself).
  const sentIds = new Set();
  const origSendMessage = sock.sendMessage.bind(sock);
  sock.sendMessage = async (...args) => {
    const result = await origSendMessage(...args);
    try {
      const id = result?.key?.id;
      if (id) {
        sentIds.add(id);
        if (sentIds.size > 3000) sentIds.delete(sentIds.values().next().value);
      }
    } catch (_) {}
    return result;
  };

  sock.ev.on('creds.update', saveCreds);

  let codeRequested = false;
  let pairingTimer = null;

  const teardownPairing = async (reason) => {
    if (pairingTimer) clearTimeout(pairingTimer);
    entry.status = 'failed';
    entry.lastError = reason;
    entry.sock = null;
    try { sock.ev.removeAllListeners(); } catch (_) {}
    try { sock.end(undefined); } catch (_) {}
    // creds.me set by requestPairingCode without a completed link is stale —
    // wipe it so the next .pair starts truly fresh (see header notes).
    wipeDir(dir);
    await notifyMain(
      notifyJid,
      `⚠️ Pairing for +${phone} did not complete (${reason}). Run .pair ${phone} again for a fresh code.`
    );
  };

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && phase === 'pairing' && !codeRequested && !sock.authState.creds.registered) {
      codeRequested = true;
      try {
        const code = await sock.requestPairingCode(phone);
        entry.pairingCode = code;
        entry.status = 'awaiting_code';
        // Pairing window: if the code isn't entered in time, tear down.
        pairingTimer = setTimeout(() => {
          if (!sock.authState.creds.registered) {
            teardownPairing('code expired / not entered');
          }
        }, PAIRING_WINDOW_MS);
        // Send the code with a native 📋 Copy Code button (cta_copy) —
        // mistyping 8 digits is the #1 way a pairing fails. copyResultCard
        // falls back to plain text automatically when rich is off/failed.
        const codeMsg = `🔑 *Pairing code for +${phone}:* *${code}*\n\nOn that phone: WhatsApp → Settings → Linked Devices → Link a Device → *Link with phone number instead*, then enter the code.\nDigits only — WhatsApp adds the dash itself. Code expires in a couple of minutes; I'll confirm here when it links.`;
        try {
          if (isTelegramJid(notifyJid)) {
            // Telegram control panel: deliver the code there directly
            // (Markdown bold renders; no native copy button on Telegram).
            await deliverNotification(notifyJid, codeMsg, { parseMode: 'Markdown' });
          } else if (client.socket?.user) {
            await copyResultCard(client.socket, notifyJid, {
              text: codeMsg,
              footer: 'NEXORA • PAIRING',
              copyLabel: '📋 Copy Code',
              copyValue: code
            });
          } else {
            await notifyMain(notifyJid, codeMsg);
          }
        } catch (_) {
          await notifyMain(notifyJid, codeMsg);
        }
      } catch (err) {
        await teardownPairing(`code request failed: ${err.message || err}`);
      }
      return;
    }

    if (connection === 'open') {
      if (pairingTimer) clearTimeout(pairingTimer);
      const wasReconnecting = entry.status === 'reconnecting';
      // First completed login? Covers both the direct path and the
      // resume-after-515 path (linking socket closes right after the code
      // is accepted; the RESUME socket completes the login).
      const firstLink = !entry.everOnline;
      entry.status = 'online';
      entry.jid = sock.user?.id || `${phone}@s.whatsapp.net`;
      entry.name = sock.user?.name || null;
      entry.connectedAt = Date.now();
      entry.reconnectAttempts = 0;
      entry.everOnline = true;
      if (phase === 'pairing' || firstLink) {
        console.log(`[SESSION] +${phone} linked — online as ${entry.name || phone}`);
        await notifyStatus(notifyJid, `🎉 +${phone} is now linked and online${entry.name ? ` as *${entry.name}*` : ''} — it now runs as its own NEXORA bot: commands its owner types in groups or their self-chat get full bot replies (owner-only and private-mode gates apply to that owner's number).`);
      } else {
        console.log(`[SESSION] +${phone} reconnected`);
        // Only after an actual drop — a routine resume stays silent.
        if (wasReconnecting) {
          await notifyStatus(notifyJid, `🟢 +${phone} is back online.`);
        }
      }
      return;
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      if (loggedOut) {
        entry.status = 'logged_out';
        entry.sock = null;
        try { sock.ev.removeAllListeners(); } catch (_) {}
        wipeDir(dir);
        sessions.delete(phone);
        console.log(`[SESSION] +${phone} logged out by WhatsApp — session removed`);
        await notifyStatus(notifyJid, `🚫 +${phone} was logged out (device removed on that phone or by WhatsApp) — session files cleaned. Re-link with .pair ${phone}.`);
        return;
      }

      if (phase === 'pairing') {
        // The phone may have ALREADY accepted the code when the socket
        // closes — baileys sets creds.registered=true at the companion
        // identity exchange (the moment the code is entered), and WhatsApp
        // then closes the linking socket with a 515 "restart required" to
        // finish the login. Tearing down there stranded the phone on
        // "logging in…" forever. Registered creds → resume to completion.
        const registered = sock.authState.creds.registered || isRegistered(dir);
        if (registered) {
          // (the loggedOut branch above already returned for 401)
          console.log(`[SESSION] +${phone} pairing socket closed (status ${statusCode ?? 'unknown'}) after the code was accepted — resuming to complete the login`);
          if (pairingTimer) clearTimeout(pairingTimer);
          entry.status = 'reconnecting';
          entry.sock = null;
          try { sock.ev.removeAllListeners(); } catch (_) {}
          setTimeout(() => {
            spawnSessionSocket(phone, 'resume', notifyJid).catch((err) => {
              console.error(`[SESSION] +${phone} post-pairing resume failed:`, err.message || err);
            });
          }, 3000);
          return;
        }
        // Closed BEFORE the code was entered. A transient drop here (515
        // restart-required is the common one behind Railway's proxy) should
        // not kill the whole pairing attempt — respawn fresh creds, request
        // a NEW code automatically, and tell the requester to use that one.
        const transient =
          statusCode === 515 || statusCode === 428 || statusCode === undefined;
        entry.pairingRetries = (entry.pairingRetries || 0) + 1;
        if (transient && entry.pairingRetries <= 2) {
          console.log(`[SESSION] +${phone} pairing socket dropped (status ${statusCode ?? 'unknown'}) before code entry — auto-retry ${entry.pairingRetries}/2 with a fresh code`);
          if (pairingTimer) clearTimeout(pairingTimer);
          entry.status = 'retrying';
          entry.sock = null;
          try { sock.ev.removeAllListeners(); } catch (_) {}
          try { sock.end(undefined); } catch (_) {}
          wipeDir(dir); // stale creds.me from the aborted code request
          try {
            await notifyStatus(notifyJid, `🔄 Connection hiccup while waiting for the code for +${phone} — generating a *fresh pairing code* now (any earlier code is invalid). It arrives next; enter the NEW one.`);
          } catch (_) {}
          setTimeout(() => {
            spawnSessionSocket(phone, 'pairing', notifyJid).catch((err) => {
              console.error(`[SESSION] +${phone} pairing auto-retry failed:`, err.message || err);
            });
          }, 3000);
          return;
        }
        await teardownPairing(`socket closed (status ${statusCode ?? 'unknown'}) before the code was entered${entry.pairingRetries > 1 ? ` (after ${entry.pairingRetries - 1} auto-retr${entry.pairingRetries === 2 ? 'y' : 'ies'})` : ''}`);
        return;
      }

      // Linked session dropped — reconnect with backoff.
      entry.status = 'reconnecting';
      entry.sock = null;
      const attempts = (entry.reconnectAttempts || 0) + 1;
      entry.reconnectAttempts = attempts;
      if (attempts > RECONNECT_MAX_ATTEMPTS) {
        sessions.delete(phone);
        await notifyStatus(notifyJid, `⚠️ +${phone} failed to reconnect ${RECONNECT_MAX_ATTEMPTS} times — session dropped. Re-link with .pair ${phone}.`);
        return;
      }
      const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, attempts - 1), RECONNECT_MAX_MS);
      console.log(`[SESSION] +${phone} reconnect attempt ${attempts} in ${delay / 1000}s`);
      setTimeout(() => {
        spawnSessionSocket(phone, 'resume', notifyJid).catch((err) => {
          console.error(`[SESSION] +${phone} reconnect failed:`, err.message || err);
        });
      }, delay);
    }
  });

  // ── Incoming messages: same dispatch as the main connection ──────────────
  sock.ev.on('messages.upsert', async (chatUpdate) => {
    if (chatUpdate.type !== 'notify') return;
    for (const rawMessage of chatUpdate.messages) {
      const key = rawMessage?.key;
      if (!key?.remoteJid) continue;

      // Never re-process our own outgoing sends (echo guard, see header).
      if (sentIds.has(key.id)) continue;

      // fromMe here = the paired account's own messages. Full-bot mode runs
      // their commands in groups and their self-chat ONLY — never in their
      // private chats with other people, where a bot reply would leak into
      // the owner's personal conversations.
      if (key.fromMe) {
        const isGroup  = key.remoteJid.endsWith('@g.us');
        const selfChat = key.remoteJid.split('@')[0].split(':')[0] === phone;
        if (!isGroup && !selfChat) continue;
      }

      // Cross-bot guard: skip messages authored by the main bot or another
      // linked session, so paired bots never react to each other's replies
      // (and cannot be chained into loops in shared groups).
      //
      // BUG (2026-10-05): a naive `authorJid.split('@')[0]` only works for
      // @s.whatsapp.net JIDs. Groups with WhatsApp's privacy-mode LID
      // delivery present key.participant as an opaque @lid JID instead of
      // the real phone number, so the naive split returned the LID's own
      // numeric part — which never matches any entry in getLinkedBotPhones
      // (a list of real phone numbers). The guard then failed to recognise
      // a sibling bot as the author, so EVERY paired bot in the group
      // (not just the one whose owner typed the command) processed the
      // same message. All of them share one singleton `client.cooldowns`
      // Map, so whichever socket won the race sent the real reply and set
      // the cooldown; every other sibling bot checked the cooldown a beat
      // later, found it already set, and replied with a cooldown notice —
      // exactly the "one account sends, the rest show cooldown" report.
      // Fix: resolve LID → phone via the same group-metadata + signalRepository
      // bridge already proven for owner checks (serializer.resolveSenderNumber),
      // falling back to the naive split only if resolution comes back empty.
      if (!key.remoteJid.endsWith('@g.us') || key.participant) {
        const authorJid = key.participant || key.remoteJid;
        const authorGroupJid = key.remoteJid.endsWith('@g.us') ? key.remoteJid : null;
        let authorPhone = null;
        try {
          authorPhone = await resolveSenderNumber(sock, authorJid, authorGroupJid);
        } catch (_) {
          // resolution can throw if the socket has no session/group access yet
        }
        if (!authorPhone) authorPhone = String(authorJid).split('@')[0].split(':')[0];
        if (authorPhone !== phone && getLinkedBotPhones(phone).includes(authorPhone)) continue;
      }

      // Cache for getMessage retries (bounded like the main store)
      try {
        const chat = rawMessage?.key?.remoteJid;
        if (chat && rawMessage?.key?.id) {
          const store = sock.opts.messageStore;
          if (!store.has(chat)) store.set(chat, new Map());
          const chatMsgs = store.get(chat);
          chatMsgs.set(rawMessage.key.id, rawMessage);
          if (chatMsgs.size > 500) chatMsgs.delete(chatMsgs.keys().next().value);
        }
      } catch (_) {}
      try {
        await handleMessage(rawMessage, sock);
      } catch (err) {
        console.error(`[SESSION] +${phone} handler error:`, err.message || err);
      }
    }
  });

  sock.ev.on('group-participants.update', async (update) => {
    try {
      await handleGroupParticipantsUpdate(update, sock);
    } catch (err) {
      console.error(`[SESSION] +${phone} group handler error:`, err.message || err);
    }
  });

  return sock;
}

/**
 * Start a pairing flow for a new number.
 * Resolves immediately with { phone, status } — the code itself is delivered
 * as a follow-up message to `notifyJid` once WA issues it, because the code
 * only exists after the socket's WS session is live.
 */
// ── Pairing requests (interactive approval flow) ─────────────────────────────
// .pair by anyone EXCEPT the super owner files a request here; the super
// owner gets an interactive Approve/Deny card in their DM (.pairapprove /
// .pairdeny / .pairrequests). In-memory by design — requests live for
// minutes, not across restarts.
const pairRequests = new Map(); // phone → { phone, dmJid, chatJid, name, ts }
const PAIR_REQUEST_TTL_MS = 15 * 60 * 1000;
const MAX_PAIR_REQUESTS = 10;

function prunePairRequests() {
  const now = Date.now();
  for (const [phone, req] of pairRequests) {
    if (now - req.ts > PAIR_REQUEST_TTL_MS) pairRequests.delete(phone);
  }
}

/**
 * File a pairing request from a non-super-owner user. Throws with a plain
 * message on validation failure; returns { phone, duplicate } otherwise.
 */
export function addPairRequest(rawPhone, { dmJid, chatJid, name, requesterId = null }) {
  prunePairRequests();
  const phone = normalizePhone(rawPhone);
  if (phone.length < 7) {
    throw new Error('That does not look like a valid phone number — include the country code, e.g. `.pair 2335XXXXXXXX`.');
  }
  if (sessions.has(phone)) {
    throw new Error(`+${phone} is already paired — remove it first with .delsession ${phone}.`);
  }
  if (sessions.size >= MAX_EXTRA_SESSIONS) {
    throw new Error(`Session limit reached (${MAX_EXTRA_SESSIONS}) — no new pairing requests accepted.`);
  }
  if (pairRequests.has(phone)) return { phone, duplicate: true };
  if (pairRequests.size >= MAX_PAIR_REQUESTS) {
    throw new Error('Too many pending pairing requests — wait for the owner to clear the queue (.pairrequests).');
  }
  // One pending request per REQUESTER: a user can't queue several numbers
  // at once — the super owner handles one decision at a time.
  const mine = [...pairRequests.values()].find(r => r.dmJid === dmJid);
  if (mine) {
    throw new Error(`You already have a pending request for +${mine.phone} — wait for it to be approved, denied, or expire (~15 min) before requesting another.`);
  }
  pairRequests.set(phone, { phone, dmJid, chatJid, name, requesterId, ts: Date.now() });
  return { phone, duplicate: false };
}

/** Pending requests (TTL-pruned, newest first). */
export function getPairRequests() {
  prunePairRequests();
  return [...pairRequests.values()].sort((a, b) => b.ts - a.ts);
}

/** Look up a pending request by id/phone WITHOUT consuming it. */
export function peekPairRequest(idOrPhone) {
  prunePairRequests();
  return pairRequests.get(normalizePhone(idOrPhone)) || null;
}

/** Consume (remove) a pending request — only after it was acted on. */
export function removePairRequest(idOrPhone) {
  return pairRequests.delete(normalizePhone(idOrPhone));
}

export async function pairSession(rawPhone, { notifyJid, pairedBy = null } = {}) {
  const phone = normalizePhone(rawPhone);
  if (phone.length < 7) {
    throw new Error('That does not look like a valid phone number — include the country code, e.g. `.pair 2335XXXXXXXX`.');
  }

  // Can't pair the main bot's own number
  const mainPhone = client.socket?.user?.id?.split(':')[0]?.split('@')[0];
  if (mainPhone && phone === mainPhone) {
    throw new Error('That is the main bot number — it is already running here.');
  }

  const existing = sessions.get(phone);
  if (existing && (existing.status === 'online' || existing.status === 'awaiting_code')) {
    throw new Error(
      existing.status === 'online'
        ? `+${phone} is already linked and online. Use .delsession ${phone} first if you want to re-pair it.`
        : `A pairing code for +${phone} was just issued and is still waiting to be entered.`
    );
  }

  const activeCount = [...sessions.values()].filter((s) => s.status === 'online' || s.status === 'awaiting_code' || s.status === 'reconnecting').length;
  if (activeCount >= MAX_EXTRA_SESSIONS) {
    throw new Error(`Session limit reached (${MAX_EXTRA_SESSIONS}). Remove one with .delsession <number> first.`);
  }

  const dir = sessionDir(phone);
  if (fs.existsSync(dir)) {
    if (isRegistered(dir)) {
      throw new Error(`+${phone} already has a saved session on disk. It will reconnect automatically — or remove it with .delsession ${phone}.`);
    }
    // Stale, never-completed link attempt — start fresh (see header notes).
    wipeDir(dir);
  }

  sessions.set(phone, {
    phone,
    status: 'starting',
    sock: null,
    jid: null,
    name: null,
    connectedAt: null,
    lastError: null,
    reconnectAttempts: 0,
    pairingCode: null,
    // Telegram user id that requested this link — powers ownership checks
    // for /status and /restart on the control panel (null when paired via
    // the WhatsApp-side .pair flow).
    pairedBy,
  });

  await spawnSessionSocket(phone, 'pairing', notifyJid);
  return { phone, status: sessions.get(phone).status };
}

/**
 * Reconnect every saved (already-linked) extra session at boot.
 */
export async function resumeExtraSessions() {
  if (resuming) return;
  resuming = true;
  try {
    const root = extrasRoot();
    if (!fs.existsSync(root)) return;
    const dirs = fs.readdirSync(root).filter((d) => fs.existsSync(path.join(root, d, 'creds.json')));
    for (const phone of dirs) {
      if (sessions.has(phone)) continue;
      if (!isRegistered(path.join(root, phone))) continue;
      sessions.set(phone, {
        phone,
        status: 'starting',
        sock: null,
        jid: `${phone}@s.whatsapp.net`,
        name: null,
        connectedAt: null,
        lastError: null,
        reconnectAttempts: 0,
        pairingCode: null,
      });
      console.log(`[SESSION] Resuming saved session +${phone}`);
      spawnSessionSocket(phone, 'resume', null).catch((err) => {
        console.error(`[SESSION] Resume of +${phone} failed:`, err.message || err);
      });
      // Stagger reconnects (1.5s) — with up to 50 saved sessions a
      // simultaneous spawn herd hammers WhatsApp's handshake and the host
      // CPU at boot. Serialized spawns keep boot stable; a full 50-session
      // fleet takes ~75s to come online, which is fine for a restart.
      await new Promise((r) => setTimeout(r, 1500));
    }
  } finally {
    resuming = false;
  }
}

/**
 * Restart one linked session: tear down its live socket (if any) and
 * respawn from the saved creds. Ownership is enforced by the caller
 * (Telegram /restart checks pairedBy; admins may restart anything).
 */
export async function restartSession(rawPhone, { notifyJid } = {}) {
  const phone = normalizeSessionPhone(rawPhone);
  const entry = sessions.get(phone);
  const dir = sessionDir(phone);

  if (entry?.status === 'awaiting_code' || entry?.status === 'starting') {
    throw new Error(`A pairing for +${phone} is still in progress — wait for it to finish or expire first.`);
  }
  const hasCreds = (entry && (entry.everOnline || entry.status === 'reconnecting')) || isRegistered(dir);
  if (!hasCreds) {
    throw new Error(`No linked session found for +${phone}. Pair it first.`);
  }

  // Tear down the live socket quietly (listeners off first so the close
  // event doesn't trigger the reconnect/backoff logic for this socket).
  if (entry?.sock) {
    try { entry.sock.ev.removeAllListeners(); } catch (_) {}
    try { entry.sock.end(undefined); } catch (_) {}
  }

  sessions.set(phone, {
    phone,
    status: 'reconnecting',
    sock: null,
    jid: entry?.jid || `${phone}@s.whatsapp.net`,
    name: entry?.name || null,
    connectedAt: null,
    lastError: null,
    reconnectAttempts: 0,
    pairingCode: null,
    everOnline: true,
    pairedBy: entry?.pairedBy || null,
  });
  console.log(`[SESSION] Manual restart of +${phone} — respawning from saved creds`);
  await spawnSessionSocket(phone, 'resume', notifyJid);
}

/**
 * Super owner power: log out and remove EVERY paired session at once —
 * both live registry entries and any leftover registered dirs on disk
 * (e.g. a session that failed to resume at boot).
 */
export async function removeAllSessions() {
  const results = [];

  const target = new Set(sessions.keys());

  // Catch saved-but-not-resumed sessions on disk too
  try {
    const root = extrasRoot();
    if (fs.existsSync(root)) {
      for (const d of fs.readdirSync(root)) {
        if (fs.existsSync(path.join(root, d, 'creds.json'))) target.add(normalizePhone(d));
      }
    }
  } catch (_) {}

  for (const phone of target) {
    try {
      await removeSession(phone);
      results.push({ phone, ok: true });
    } catch (err) {
      results.push({ phone, ok: false, error: err.message || String(err) });
    }
  }
  return results;
}

/**
 * Log out and remove an extra session.
 */
export async function removeSession(rawPhone) {
  const phone = normalizePhone(rawPhone);
  const entry = sessions.get(phone);
  const dir = sessionDir(phone);
  const onDisk = fs.existsSync(dir);

  if (!entry && !onDisk) {
    throw new Error(`No session found for +${phone}. Check .sessions for the list.`);
  }

  if (entry?.sock) {
    try {
      await entry.sock.logout();
    } catch (_) {
      try { entry.sock.end(undefined); } catch (_) {}
    }
    try { entry.sock.ev.removeAllListeners(); } catch (_) {}
  }

  wipeDir(dir);
  sessions.delete(phone);

  return {
    phone,
    wasOnline: entry?.status === 'online',
    message: `Session for +${phone} removed and logged out.`,
  };
}
