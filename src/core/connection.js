import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  Browsers
} from 'baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { config } from '../../config/index.js';
import brand from '../../config/brand.js';
import { attachOutgoingTracker } from '../lib/outgoingCache.js';
import { db } from '../database/db.js';
import { handleMessage } from '../handlers/message.js';
import { handleGroupParticipantsUpdate } from '../handlers/group.js';
import { snitchRecall } from '../lib/antiGuard.js';
import { client } from './client.js';
import { connectionMonitor } from './connectionMonitor.js';
import { getLinkedBotPhones } from './sessionManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const logger = pino({ level: 'silent' });

let reconnectAttempts = 0;
const BASE_DELAY_MS   = config.reconnectLimit === 0 ? 5000 : 5000;
const MAX_DELAY_MS    = config.keepAliveIntervalMs ? 60000 : 60000;

// ── Memory bounds for the in-memory message store ──────────────────────────
const MAX_MSGS_PER_CHAT = 500;
const MAX_TRACKED_CHATS = 2000;

/**
 * Exponential backoff delay: 5s, 10s, 20s, 40s … capped at 60s
 */
function getReconnectDelay(attempt) {
  return Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), MAX_DELAY_MS);
}

/**
 * Export connection state for the stats endpoint and health checks.
 * Reads from the connectionMonitor singleton.
 */
export function getConnectionState() {
  const health  = connectionMonitor.getHealth();
  const metrics = connectionMonitor.getMetrics();
  const stats   = connectionMonitor.getReconnectStats();
  const state   = connectionMonitor.getState();
  const history = connectionMonitor.getStateHistory();

  return {
    current:            state,
    lastConnectTime:    health.uptime > 0 ? Date.now() - health.uptime : null,
    totalConnects:      stats.successfulReconnects + 1, // +1 for initial connect (not a reconnect)
    totalDisconnects:   stats.failedReconnects,
    totalMessages:      health.totalMessages,
    totalCommands:      metrics.commandsExecuted,
    totalErrors:        health.totalErrors,
    lastIncomingTime:   health.lastIncomingAge != null ? Date.now() - health.lastIncomingAge : null,
    lastOutgoingTime:   health.lastOutgoingAge != null ? Date.now() - health.lastOutgoingAge : null,
    reconnectHistory:   connectionMonitor.getReconnectHistory(),
    stateHistory:       history,
    uptime:             health.uptime,
    latency:             connectionMonitor.heartbeat.getLatency(),
  };
}

export async function connectToWhatsApp() {
  console.log('[CONNECTION] Initializing WhatsApp multi-device connection...');
  connectionMonitor.recordConnecting();

  // Ensure session directory exists
  const sessionDir = path.resolve(config.sessionPath);
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  // Session persistence diagnostics — answers, from the very first log line,
  // WHY the bot re-pairs: if creds.json is missing here but the bot was paired
  // on the previous boot, the session dir is not on the persistent volume and
  // every redeploy starts from scratch.
  {
    const hasCreds = fs.existsSync(path.join(sessionDir, 'creds.json'));
    const fileCount = fs.readdirSync(sessionDir).length;
    console.log(
      `[CONNECTION] Session dir: ${sessionDir} — creds.json ${hasCreds ? 'FOUND (session will be reused)' : 'MISSING (fresh pairing required)'} — ${fileCount} file${fileCount === 1 ? '' : 's'}`
    );
    if (!hasCreds) {
      console.warn(
        `[CONNECTION] Pairing again? creds.json should exist after a successful pair. If the bot was paired before this boot, point SESSION_PATH at the volume mount (got: '${config.sessionPath}')`
      );
    }
  }

  // Fetch the current WAWeb version so the socket presents as up-to-date.
  // On failure pass NO version — baileys then uses its own bundled default,
  // the exact path Moonson (proven linking on this account) runs on. The old
  // hardcoded fallback [2,3000,1044479778] is a stale 2024 WAWeb version and
  // presenting it can make WhatsApp reject the device link outright
  // ("couldn't link device" at code entry).
  let version;
  try {
    const { version: v } = await fetchLatestBaileysVersion();
    version = v;
    console.log(`[CONNECTION] Using WA version: ${v.join('.')}`);
  } catch {
    version = undefined;
    console.warn('[CONNECTION] Could not fetch latest WA version — letting baileys use its default.');
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    logger,
    printQRInTerminal: !config.pairing.enabled,
    // Platform identity is sent INSIDE the link_code_companion_reg pairing
    // request (companion_platform_id / companion_platform_display). The old
    // ['Ubuntu','Chrome','20.0.0'] tuple claims an ancient Chrome build;
    // Browsers.macOS('Safari') is the tuple Moonson links with in
    // production on this same account — align to the proven presentation.
    browser: Browsers.macOS('Safari'),
    markOnlineOnConnect: true,
    syncFullHistory: false,
    connectTimeoutMs: config.connectTimeoutMs || 60000,
    keepAliveIntervalMs: config.keepAliveIntervalMs || 30000,
    retryRequestDelayMs: 2000,
    // In-memory message store for retries and quoted message decryption.
    messageStore: new Map(),
    getMessage: async (key) => {
      const chat = key?.remoteJid;
      if (!chat) return { conversation: '' };
      const store = sock.opts?.messageStore;
      if (!store) return { conversation: '' };
      const msgs = store.get(chat);
      if (!msgs) return { conversation: '' };
      const msg = msgs.get(key.id);
      return msg || { conversation: '' };
    }
  });

  client.socket = sock;

  // ── Outgoing message tracking (powers .delall) ────────────────────────────
  // Wraps sendMessage + relayMessage to record every outgoing id per chat.
  attachOutgoingTracker(sock);

  // ── Stale pairing state cleanup ────────────────────────────────────────────
  // requestPairingCode() sets creds.me (and persists it) the moment a code is
  // requested, but creds.registered only becomes true after the full
  // companion_finish handshake. If a link attempt fails or is abandoned, the
  // session keeps a stale creds.me forever — and every later boot then looks
  // "already paired" to the old creds.me-based gate, so NO fresh code is ever
  // requested while the user keeps entering the original (dead) code.
  if (config.pairing.enabled && !sock.authState.creds.registered && sock.authState.creds.me) {
    console.log('[CONNECTION] Clearing stale pairing state from an earlier failed link attempt');
    delete sock.authState.creds.me;
    delete sock.authState.creds.pairingCode;
    await saveCreds();
  }

  // ── Pairing code request ──────────────────────────────────────────────────
  // NOTE: the code is requested in the connection.update handler below, ONLY
  // after the `qr` event proves the WebSocket session with WA servers is
  // established. Requesting earlier (blind setTimeout after makeWASocket)
  // races the cold-start: on slow hosts the request fires before the WS is
  // ready and WhatsApp issues a code that fails at entry with no error here.

  // flag shared with the handler below — one code per socket lifetime
  let pairingCodeRequested = false;
  const requestPairingCodeOnce = async () => {
    // Gate on `registered` — the ONLY signal that a link actually completed.
    // creds.me is set by requestPairingCode itself and means nothing here.
    if (pairingCodeRequested || sock.authState.creds.registered) return;
    pairingCodeRequested = true;
    try {
      const cleanPhone = config.pairing.phoneNumber.replace(/[^0-9]/g, '');
      console.log(`[CONNECTION] Requesting pairing code for: ${cleanPhone}`);
      const code = await sock.requestPairingCode(cleanPhone);
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🔑 WHATSAPP PAIRING CODE: ${code}`);
      console.log(`👉 WhatsApp → Settings → Linked Devices → Link a Device`);
      console.log(`   Then "Link with phone number instead".`);
      console.log(`⏱️  Codes expire in a couple of minutes — enter it right away,`);
      console.log(`   digits only (WhatsApp adds the dash itself).`);
      console.log(`${'='.repeat(60)}\n`);
    } catch (err) {
      pairingCodeRequested = false;
      console.error('[CONNECTION] Failed to request pairing code:', err.message || err);
    }
  };

  // ── Auth credentials persistence ──────────────────────────────────────────
  sock.ev.on('creds.update', saveCreds);

  // ── Connection lifecycle ──────────────────────────────────────────────────
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && !config.pairing.enabled) {
      console.log('[CONNECTION] Scan this QR code to authenticate:');
      qrcode.generate(qr, { small: true });
    }

    // Pairing mode: the qr event means the WS session is live and ready for
    // auth — this is the earliest safe point to request a pairing code.
    // Fires once per socket; every reconnect creates a new socket and a NEW
    // code (all previously printed codes are invalidated by WhatsApp).
    if (qr && config.pairing.enabled && config.pairing.phoneNumber) {
      if (!pairingCodeRequested) {
        console.log('[CONNECTION] New pairing code below — any older code is now INVALID.');
        await requestPairingCodeOnce();
      }
    }

    if (connection === 'connecting') {
      console.log('[CONNECTION] Connecting to WhatsApp servers...');

    } else if (connection === 'open') {
      reconnectAttempts = 0;
      connectionMonitor.recordConnected(sock);

      const health  = connectionMonitor.getHealth();
      const stats   = connectionMonitor.getReconnectStats();

      console.log(`\n╭───────────────────────────────────╮`);
      console.log(`│         ${brand.name} v${brand.version}         │`);
      console.log(`│                                   │`);
      console.log(`│         ${brand.signature}              │`);
      console.log(`│                                   │`);
      console.log(`│       Successfully Online          │`);
      console.log(`╰───────────────────────────────────╯\n`);
      console.log(`🤖 Logged in as: ${sock.user?.name || 'Bot'} (${sock.user?.id?.split(':')[0]})\n`);
      console.log(`[CONNECTION] Total connects: ${stats.successfulReconnects + 1}, Total disconnects: ${stats.failedReconnects}\n`);

      // Reminder re-arming lives in src/lib/reminderService.js (boot hook
      // in server.js). Its timers survive reconnects, and fire() re-queues
      // on delivery failure for the next boot sweep — nothing to do here.

    } else if (connection === 'close') {
      const statusCode   = lastDisconnect?.error?.output?.statusCode;
      const errorMessage = lastDisconnect?.error?.message || 'Unknown';
      console.log(`[CONNECTION] Disconnect — statusCode: ${statusCode}, reason: ${errorMessage}`);

      connectionMonitor.recordDisconnect(errorMessage, statusCode, errorMessage);

      // Determine whether this disconnect is recoverable
      const loggedOut          = statusCode === DisconnectReason.loggedOut;
      const connectionReplaced = statusCode === DisconnectReason.connectionReplaced;
      const badSession         = statusCode === DisconnectReason.badSession;

      if (loggedOut) {
        console.error('[CONNECTION] Session logged out by WhatsApp — clearing session and scheduling re-pair in 30s...');
        db.saveSync();
        try {
          const files = fs.readdirSync(sessionDir);
          // Skip directories (session/extras holds additional linked sessions
          // managed by sessionManager.js — they share this persistent volume).
          for (const f of files) {
            const p = path.join(sessionDir, f);
            if (fs.statSync(p).isDirectory()) continue;
            fs.rmSync(p, { force: true });
          }
          console.log('[CONNECTION] Session cleared. Will attempt re-pair in 30 seconds...');
        } catch (e) {
          console.error('[CONNECTION] Failed to clear session:', e.message);
        }
        reconnectAttempts = 0;
        setTimeout(connectToWhatsApp, 30000);
        return;
      }

      if (connectionReplaced) {
        console.error('[CONNECTION] Another device opened this session. Bot shutting down to avoid conflicts.');
        db.saveSync();
        process.exit(1);
        return;
      }

      if (badSession) {
        console.error('[CONNECTION] Bad session file detected. Delete session/ and re-pair.');
        db.saveSync();
        process.exit(1);
        return;
      }

      // Recoverable disconnect — attempt reconnect with exponential backoff
      console.warn(`[CONNECTION] Closed (code: ${statusCode}, reason: ${errorMessage}). Attempting reconnect...`);

      // 0 = unlimited reconnects (production), >0 = limited attempts
      const maxAttempts = config.reconnectLimit;
      if (maxAttempts === 0 || reconnectAttempts < maxAttempts) {
        reconnectAttempts++;
        const delay = getReconnectDelay(reconnectAttempts);
        console.log(`[CONNECTION] Reconnect attempt ${reconnectAttempts}${maxAttempts > 0 ? `/${maxAttempts}` : ' (unlimited)'} in ${delay / 1000}s...`);
        connectionMonitor.recordReconnectAttempt(errorMessage, reconnectAttempts);
        setTimeout(connectToWhatsApp, delay);
      } else {
        console.error(`[CONNECTION] Max reconnect attempts (${maxAttempts}) reached. Shutting down.`);
        db.saveSync();
        process.exit(1);
      }
    }
  });

  // ── Incoming messages ─────────────────────────────────────────────────────
  sock.ev.on('messages.upsert', async (chatUpdate) => {
    if (chatUpdate.type !== 'notify') return;

    for (const rawMessage of chatUpdate.messages) {
      connectionMonitor.recordIncomingMessage(rawMessage);

      // Loop guard: skip messages authored by .pair-linked extra sessions —
      // the main bot never reacts to another linked bot's replies, and the
      // extras skip the main bot's (see sessionManager.js).
      try {
        const rkey = rawMessage?.key;
        if (rkey && (!rkey.remoteJid?.endsWith('@g.us') || rkey.participant)) {
          const authorJid  = rkey.participant || rkey.remoteJid;
          const authorPhone = String(authorJid).split('@')[0].split(':')[0];
          const mainPhone   = sock.user?.id?.split(':')[0]?.split('@')[0];
          if (authorPhone !== mainPhone && getLinkedBotPhones(mainPhone).includes(authorPhone)) continue;
        }
      } catch (_) {}

      // Cache message for getMessage retries
      try {
        const chat = rawMessage?.key?.remoteJid;
        if (chat && rawMessage?.key?.id) {
          const store = sock.opts.messageStore;

          // Evict oldest chat if we've hit the max tracked chats limit
          if (!store.has(chat) && store.size >= MAX_TRACKED_CHATS) {
            const oldestChat = store.keys().next().value;
            store.delete(oldestChat);
          }

          if (!store.has(chat)) {
            store.set(chat, new Map());
          }

          const chatMsgs = store.get(chat);
          chatMsgs.set(rawMessage.key.id, rawMessage);

          // Bound memory: keep last MAX_MSGS_PER_CHAT messages per chat
          if (chatMsgs.size > MAX_MSGS_PER_CHAT) {
            const firstKey = chatMsgs.keys().next().value;
            chatMsgs.delete(firstKey);
          }
        }
      } catch (_) {}

      try {
        await handleMessage(rawMessage, sock);
      } catch (err) {
        connectionMonitor.recordErrorCaught(err);
        console.error('[HANDLER ERROR] Uncaught error in message handler:', err.message || err);
      }
    }
  });

  // ── Group participant events ───────────────────────────────────────────────
  sock.ev.on('group-participants.update', async (update) => {
    connectionMonitor.recordGroupEvent(update);
    try {
      await handleGroupParticipantsUpdate(update, sock);
    } catch (err) {
      console.error('[HANDLER ERROR] Uncaught error in group handler:', err.message || err);
    }
  });

  // ── Anti-delete (snitch): repost deleted messages when enabled ─────────
  sock.ev.on('messages.update', async (updates) => {
    try {
      for (const u of updates) {
        const revoke = u.update?.message?.protocolMessage
          && u.update.message.protocolMessage.type === 0; // REVOKE
        if (!revoke) continue;
        const jid = u.key?.remoteJid;
        if (!jid?.endsWith('@g.us')) continue;
        const groupData = db.getGroup(jid);
        if (!groupData.antidelete) continue;
        const deletedKey = u.update.message.protocolMessage.key;
        const entry = snitchRecall(jid, deletedKey?.id);
        if (!entry) continue;
        const num = String(entry.sender).split('@')[0].split(':')[0];
        const snitch = async (content) => sock.sendMessage(jid, content, { mentions: [entry.sender] }).catch(() => {});
        if (entry.body && (entry.type === 'conversation' || entry.type === 'extendedTextMessage')) {
          await snitch({
            text: `🗑️ *Anti-delete* — @${num} deleted:\n\n${entry.body.slice(0, 3000)}`,
          });
        } else {
          await snitch({
            text: `🗑️ *Anti-delete* — @${num} deleted a *${entry.type}* message. Media expired from cache — use ${config.prefix[0]}save on it before it's deleted next time.`,
          });
        }
      }
    } catch (err) {
      console.error('[ANTIDELETE] Error:', err.message);
    }
  });

  // ── Anti-call ────────────────────────────────────────────────────────────
  sock.ev.on('call', async (calls) => {
    if (!config.features?.antiCall || !db.getSettings().anticall) return;
    for (const call of calls) {
      if (call.status !== 'offer') continue;
      try {
        await sock.rejectCall(call.id, call.from);
        await sock.sendMessage(call.chatId || call.from, {
          text: '📵 This account does not accept calls. Your call was automatically declined.'
        }).catch(() => {});
      } catch (err) {
        console.error('[ANTICALL] Failed to reject call:', err.message || err);
      }
    }
  });

  // ── Presence updates ──────────────────────────────────────────────────────
  // Track presence to detect stale connections
  sock.ev.on('presence.update', (update) => {
    // Presence updates indicate the connection is alive — record as incoming
    connectionMonitor.heartbeat.recordIncoming();
  });

  // ── Messages sent tracking ────────────────────────────────────────────────
  // connectionMonitor.attachSocket(sock) patches sendMessage to record outgoing
  // messages automatically — no need for a manual wrapper here.

  return sock;
}

export default connectToWhatsApp;
