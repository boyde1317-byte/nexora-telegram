/**
 * index.js — NEXORA Telegram control panel.
 *
 * A Telegram front-end for the NEXORA-MD multi-session engine: the same
 * sessionManager that powers the WhatsApp .pair flow, driven from Telegram
 * instead. Every NEXORA WhatsApp feature stays untouched — this layer only
 * adds a second, richer control surface:
 *
 *   • /pair    — admins pair directly, the pairing code lands in this chat
 *   • non-admins file a request → inline Approve/Deny keyboard for admins
 *   • /sessions /pairrequests /unpair /logoutall /reload — full lifecycle
 *   • session lifecycle alerts mirror to the owner's Telegram DM
 *
 * Design notes (lessons from the Yuzuki v1 port):
 *   • NO folder-scanning session database — sessionManager is the single
 *     source of truth (live registry + statuses, not auth folders).
 *   • Reconnect/backoff behaviour is NEXORA's (exponential, capped), not
 *     Yuzuki's flat 3s infinite retry loop.
 *   • Approval is REQUIRED — unlike Yuzuki, strangers who find the bot
 *     cannot pair a number instantly; requests queue behind admin approval.
 *   • Polling errors are logged and the library self-heals; switch to a
 *     webhook (bot.setWebhook) only if update drops ever show up in logs.
 *
 * Env (all optional — when TELEGRAM_BOT_TOKEN is unset this layer is inert):
 *   TELEGRAM_BOT_TOKEN   — from @BotFather
 *   TELEGRAM_OWNER_ID    — owner's Telegram user id (full control)
 *   TELEGRAM_ADMIN_IDS   — comma-separated extra admin ids (optional)
 *
 * Extra admins can also be granted at runtime with /addadmin (owner only),
 * stored in database/telegram_admins.json.
 */
import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import path from 'path';

// Developer contact shown on the main menu
const DEV_CONTACT = { name: 'DeathCore_Xr', url: 'https://t.me/DeathCore_Xr' };

// Branded banner for /start (best-effort; absent file just logs a warning)
const BANNER_PATH = path.join(process.cwd(), 'media', 'images', 'banners', 'nexora-banner.jpg');

import { config } from '../../config/index.js';
import {
  pairSession,
  addPairRequest,
  getPairRequests,
  peekPairRequest,
  removePairRequest,
  listSessions,
  activeSessionSockets,
  removeSession,
  removeAllSessions,
  resumeExtraSessions,
  MAX_EXTRA_SESSIONS,
} from '../core/sessionManager.js';
import {
  registerTelegramSender,
  setTelegramOwnerChat,
  telegramJid,
  sendToTelegramChat,
} from './bridge.js';

/** Persisted Telegram admin ids (beyond owner + env list). */
const ADMINS_FILE = path.resolve('database', 'telegram_admins.json');

const TELEGRAM_MAX_LEN = 4000; // hard cap is 4096 — leave headroom

/** Telegram-flavored bold differs from WA only in underscores — keep WA
 *  *bold* syntax; Telegram Markdown parses it identically. */
function clip(text) {
  const t = String(text || '');
  return t.length > TELEGRAM_MAX_LEN ? `${t.slice(0, TELEGRAM_MAX_LEN)}\n…(truncated)` : t;
}

function readAdmins() {
  try {
    if (!fs.existsSync(ADMINS_FILE)) return [];
    return JSON.parse(fs.readFileSync(ADMINS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeAdmins(list) {
  try {
    fs.mkdirSync(path.dirname(ADMINS_FILE), { recursive: true });
    fs.writeFileSync(ADMINS_FILE, JSON.stringify(list, null, 2));
  } catch (err) {
    console.warn('[TG] could not persist telegram admins:', err.message || err);
  }
}

function isAdmin(user) {
  const id = String(user?.id ?? '');
  if (!id) return false;
  if (id === String(process.env.TELEGRAM_OWNER_ID ?? '')) return true;
  const envAdmins = (process.env.TELEGRAM_ADMIN_IDS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  if (envAdmins.includes(id)) return true;
  return readAdmins().includes(id);
}

function isOwner(user) {
  return String(user?.id ?? '') === String(process.env.TELEGRAM_OWNER_ID ?? '');
}

function normalizePhone(raw) {
  return String(raw || '').replace(/[^0-9]/g, '');
}

/** Simple per-user flood guard — the Telegram side of NEXORA's rate
 *  limiting. 6 pair commands / 60s per user. */
const pairAttempts = new Map();
function floodOk(userId) {
  const now = Date.now();
  const rec = pairAttempts.get(userId) || { n: 0, window: now };
  if (now - rec.window > 60_000) {
    pairAttempts.set(userId, { n: 1, window: now });
    return true;
  }
  rec.n += 1;
  if (rec.n > 6) return false;
  return true;
}

/** The send function the bridge uses for all core notifications. */
async function tgSend(chatId, text, opts = {}) {
  if (!bot) throw new Error('telegram bot not started');
  await bot.sendMessage(chatId, clip(text), {
    parse_mode: opts.parseMode ? 'Markdown' : undefined,
  });
}

let bot = null;

/**
 * Boot the Telegram control panel. No-op when TELEGRAM_BOT_TOKEN is unset.
 */
export async function startTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log('[TG] TELEGRAM_BOT_TOKEN not set — Telegram control panel disabled (WhatsApp side unaffected).');
    return null;
  }
  if (bot) return bot;

  const ownerId = String(process.env.TELEGRAM_OWNER_ID || '');
  if (!ownerId) {
    console.warn('[TG] TELEGRAM_OWNER_ID not set — owner-only Telegram commands will be unusable until configured.');
  }

  bot = new TelegramBot(token, { polling: true });
  registerTelegramSender(tgSend);
  if (ownerId) setTelegramOwnerChat(ownerId);

  bot.on('polling_error', (err) => {
    // node-telegram-bot-api retries polling automatically; log & move on.
    console.warn('[TG] polling error:', err?.code || err?.message || err);
  });

  const reply = (chatId, text, opts = {}) =>
    bot.sendMessage(chatId, clip(text), {
      parse_mode: opts.plain ? undefined : 'Markdown',
      ...(opts.keyboard ? { reply_markup: opts.keyboard } : {}),
    });

  // ── Inline button UI ───────────────────────────────────────────────
  const mainMenuKeyboard = (admin) => ({
    inline_keyboard: [
      [{ text: '⚡ Sessions', callback_data: 'nav:sessions' }, { text: '🔑 Pair a number', callback_data: 'nav:pair' }],
      [{ text: '❓ Help', callback_data: 'nav:help' }, { text: '🔁 Reload fleet', callback_data: 'nav:reload' }],
      ...(admin ? [[{ text: '📥 Pair requests', callback_data: 'nav:requests' }]] : []),
      [{ text: '👤 Contact Dev', url: DEV_CONTACT.url }],
    ],
  });
  const backKeyboard = () => ({
    inline_keyboard: [[{ text: '⬅️ Menu', callback_data: 'nav:menu' }]],
  });
  const sessionsKeyboard = () => ({
    inline_keyboard: [
      [{ text: '🔄 Refresh', callback_data: 'nav:sessions' }, { text: '⬅️ Menu', callback_data: 'nav:menu' }],
    ],
  });

  async function sendSessionsList(chatId) {
    const all = listSessions();
    if (!all.length) {
      return reply(chatId, `No linked sessions yet — tap *Pair a number* below.`, { keyboard: mainMenuKeyboard(false) });
    }
    const icon = (st) =>
      st === 'online' ? '🟢' :
      st === 'awaiting_code' ? '🔑' :
      st === 'reconnecting' ? '🔄' :
      st === 'starting' ? '⏳' : '🔴';
    const up = (ts) => ts ? new Date(ts).toISOString().slice(0, 16).replace('T', ' ') : '—';
    const lines = all.map((sn, i) =>
      `${icon(sn.status)} *${i + 1}. +${sn.phone}* — ${sn.status}` +
      (sn.name ? ` (${sn.name})` : '') +
      (sn.connectedAt ? ` • since ${up(sn.connectedAt)} UTC` : '') +
      (sn.lastError && sn.status !== 'online' ? `\n      ⚠️ ${sn.lastError}` : '')
    );
    await reply(chatId,
      `📋 *Linked Sessions (${all.length}/${MAX_EXTRA_SESSIONS})*\n\n${lines.join('\n\n')}`,
      { keyboard: sessionsKeyboard() });
  }

  async function sendHelpGuide(chatId, admin) {
    return reply(chatId,
      `📚 *${config.botName} Telegram Command Guide*\n\n` +
      `*Pairing*\n` +
      `  /pair 233XXXXXXXXX — link a number (admins: code lands right here; others: request goes to admins)\n` +
      `  /pairapprove [number] — approve a pending request (admin)\n` +
      `  /pairdeny [number] — deny a pending request (admin)\n` +
      `  /pairrequests — request queue (admin)\n` +
      `  /unpair <number> — remove a linked session (admin)\n\n` +
      `*Fleet*\n` +
      `  /sessions — every session, live status\n` +
      `  /reload — reconnect all saved sessions (admin)\n` +
      `  /logoutall — wipe the whole fleet (owner)\n` +
      `  /broadcast <text> — send to all groups of all sessions (owner)\n\n` +
      `*Admin*\n` +
      `  /addadmin <id> — grant admin (owner)\n` +
      `  /ping — latency check\n\n` +
      `All WhatsApp-side NEXORA commands (.menu etc.) work unchanged on every linked number.`,
      { keyboard: mainMenuKeyboard(admin) });
  }

  // ── /start ──────────────────────────────────────────────────────────
  bot.onText(/\/start/, async (msg) => {
    const name = msg.from?.first_name || 'there';
    const admin = isAdmin(msg.from);
    // Branded banner first (best-effort; never blocks the welcome text)
    try {
      await bot.sendPhoto(msg.chat.id, BANNER_PATH);
    } catch (err) {
      console.warn('[TG] banner photo failed, continuing:', err.message);
    }
    await reply(msg.chat.id,
      `⚡ *Welcome to ${config.botName} Control, ${name}!*\n\n` +
      `This is the Telegram command deck for your NEXORA WhatsApp multi-session fleet — up to *${MAX_EXTRA_SESSIONS} linked numbers*, each running the full NEXORA engine.\n\n` +
      `${admin ? 'You are an admin here. ' : ''}Core commands:\n` +
      `/pair <number> — link a WhatsApp number\n` +
      `/sessions — fleet status\n` +
      `/help — full command guide`, { keyboard: mainMenuKeyboard(admin) });
  });

  // ── /help ───────────────────────────────────────────────────────────
  bot.onText(/\/help/, async (msg) => {
    await sendHelpGuide(msg.chat.id, isAdmin(msg.from));
  });

  // ── /ping ───────────────────────────────────────────────────────────
  bot.onText(/\/ping/, async (msg) => {
    const start = Date.now();
    await bot.sendMessage(msg.chat.id, `🏓 Pong!`);
    await bot.sendMessage(msg.chat.id, `⚡ Round-trip: *${Date.now() - start}ms*`, { parse_mode: 'Markdown' });
  });

  // ── /sessions ───────────────────────────────────────────────────────
  bot.onText(/\/sessions|\/listpairs/, async (msg) => {
    await sendSessionsList(msg.chat.id);
  });

  // ── /pair <number> ──────────────────────────────────────────────────
  bot.onText(/\/pair(?:\s+(\S+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const raw = match?.[1];

    if (!raw) {
      return reply(chatId,
        `📱 *Link a WhatsApp number*\n\n` +
        `Usage: \`/pair 233XXXXXXXXX\`\n\n` +
        `Include the country code, no + or spaces.\n` +
        `Admins pair instantly — the code arrives right here. Others file a request for admin approval.`);
    }

    const phone = normalizePhone(raw);
    if (phone.length < 7 || phone.length > 15) {
      return reply(chatId, `❌ That doesn't look like a valid number — 7-15 digits with country code, e.g. \`/pair 2335XXXXXXXX\`.`);
    }
    if (phone.startsWith('0')) {
      return reply(chatId, `❌ Drop the leading 0 — use the country code instead (e.g. 233…).`);
    }
    if (!floodOk(msg.from.id)) {
      return reply(chatId, `⏳ Slow down a moment — too many pairing attempts in the last minute.`);
    }

    const activeCount = listSessions().filter((s) => s.active || s.status === 'awaiting_code').length;
    if (activeCount >= MAX_EXTRA_SESSIONS) {
      return reply(chatId, `⚠️ *Fleet full (${MAX_EXTRA_SESSIONS}/${MAX_EXTRA_SESSIONS})* — remove one first with /unpair <number>.`);
    }

    // ── Admin: pair directly, code delivered to THIS chat ──
    if (isAdmin(msg.from)) {
      const status = await bot.sendMessage(chatId, `⏳ Opening a pairing channel for *+${phone}*…`, { parse_mode: 'Markdown' });
      try {
        await pairSession(phone, { notifyJid: telegramJid(chatId) });
        await bot.editMessageText(
          `🔌 *Pairing channel open for +${phone}.*\n\nThe code arrives in the next message — enter it on that phone within a couple of minutes:\nWhatsApp → Settings → Linked Devices → Link a Device → *Link with phone number instead*.`,
          { chat_id: chatId, message_id: status.message_id, parse_mode: 'Markdown' }
        );
      } catch (err) {
        await bot.editMessageText(`❌ *Pairing failed:* ${err.message || err}`,
          { chat_id: chatId, message_id: status.message_id, parse_mode: 'Markdown' });
      }
      return;
    }

    // ── Everyone else: file a request, admins get an inline card ──
    let req;
    try {
      ({ req } = addPairRequest(raw, {
        dmJid: telegramJid(chatId),
        chatJid: telegramJid(chatId),
        name: msg.from?.first_name || msg.from?.username || 'unknown',
      }));
    } catch (err) {
      return reply(chatId, `❌ *Request rejected:* ${err.message || err}`);
    }

    // Notify every admin with an Approve/Deny inline keyboard.
    const adminIds = new Set([ownerId, ...(process.env.TELEGRAM_ADMIN_IDS || '').split(',').map((s) => s.trim()), ...readAdmins()].filter(Boolean));
    const card = `📶 *PAIRING REQUEST*\n\nNumber: +${req.phone}\nRequested by: ${msg.from?.first_name || msg.from?.username || 'unknown'}\n\nApproving sends the pairing code to the requester's chat. Requests expire after ~15 minutes.`;
    const keyboard = {
      inline_keyboard: [[
        { text: '✅ Approve', callback_data: `papprove:${req.phone}` },
        { text: '❌ Deny', callback_data: `pdeny:${req.phone}` },
      ]],
    };
    let delivered = false;
    for (const adminId of adminIds) {
      try {
        await bot.sendMessage(adminId, clip(card), { parse_mode: 'Markdown', reply_markup: keyboard });
        delivered = true;
      } catch (_) {}
    }
    await reply(chatId, delivered
      ? `📨 *Request filed for +${req.phone}.* Admins were notified — once approved, the pairing code arrives here.`
      : `📨 *Request filed for +${req.phone}.* It's in the queue — an admin will act on it via /pairrequests.`);
  });

  // ── /pairrequests ───────────────────────────────────────────────────
  bot.onText(/\/pairrequests/, async (msg) => {
    if (!isAdmin(msg.from)) return reply(msg.chat.id, `🔒 Admin only.`);
    const all = getPairRequests();
    if (!all.length) return reply(msg.chat.id, `No pending pairing requests.`);
    const lines = all.map((r, i) => `${i + 1}. +${r.phone} — ${r.name || 'unknown'} • filed ${new Date(r.ts).toISOString().slice(11, 16)} UTC`);
    await reply(msg.chat.id,
      `📋 *Pending Pairing Requests (${all.length})*\n\n${lines.join('\n')}\n\nApprove: \`/pairapprove <number>\` · Deny: \`/pairdeny <number>\``);
  });

  // ── /pairapprove / /pairdeny (commands mirror the inline buttons) ───
  bot.onText(/\/pairapprove(?:\s+(\S+))?/, (msg, match) => handleApproval(msg, match, true));
  bot.onText(/\/pairdeny(?:\s+(\S+))?/, (msg, match) => handleApproval(msg, match, false));

  async function handleApproval(msg, match, approve) {
    if (!isAdmin(msg.from)) return reply(msg.chat.id, `🔒 Admin only.`);
    const chatId = msg.chat.id;

    let req = null;
    if (match?.[1]) {
      req = peekPairRequest(normalizePhone(match[1]));
      if (!req) return reply(chatId, `❌ No pending request for that number — see /pairrequests.`);
    } else {
      const all = getPairRequests();
      if (all.length === 1) req = all[0];
      else if (all.length === 0) return reply(chatId, `No pending pairing requests.`);
      else return reply(chatId, `Several requests pending — pick one: ${all.map((r) => `\n/pair${approve ? 'approve' : 'deny'} ${r.phone}`).join('')}`);
    }

    if (!approve) {
      removePairRequest(req.phone);
      await notifyRequester(req.dmJid, `🚫 Your pairing request for *+${req.phone}* was denied.`);
      return reply(chatId, `🚫 Denied the request for +${req.phone}.`);
    }

    const status = await bot.sendMessage(chatId, `⏳ Approving +${req.phone}…`);
    try {
      await pairSession(req.phone, { notifyJid: req.dmJid });
      removePairRequest(req.phone);
      await bot.editMessageText(`✅ *Approved — pairing channel open for +${req.phone}.* The code is being delivered to the requester.`,
        { chat_id: chatId, message_id: status.message_id, parse_mode: 'Markdown' });
      await notifyRequester(req.dmJid, `✅ *Your pairing request for +${req.phone} was APPROVED!* The code arrives next — enter it within a couple of minutes.`);
    } catch (err) {
      await bot.editMessageText(`❌ *Pairing failed after approval:* ${err.message || err}\n\nThe request was kept — retry or /pairdeny ${req.phone}.`,
        { chat_id: chatId, message_id: status.message_id, parse_mode: 'Markdown' });
    }
  }

  async function notifyRequester(dmJid, text) {
    if (!dmJid) return;
    if (String(dmJid).startsWith('tg:')) {
      await sendToTelegramChat(String(dmJid).slice(3), text, { parseMode: 'Markdown' });
    } else {
      // WA-originated request — the code/notification path is handled by
      // the core (notifyMain via the WhatsApp socket). Nothing to do here.
    }
  }

  // ── Inline keyboard callbacks (Approve / Deny) ───────────────────────
  bot.on('callback_query', async (query) => {
    const data = query.data || '';

    // ── Navigation buttons (open to everyone; admin-only ones gated) ──
    if (data.startsWith('nav:')) {
      const chatId = query.message?.chat?.id;
      const admin = isAdmin(query.from);
      const nav = data.slice(4);
      if (!chatId) return bot.answerCallbackQuery(query.id);
      await bot.answerCallbackQuery(query.id, { text: 'Loading…' });
      if (nav === 'sessions') return sendSessionsList(chatId);
      if (nav === 'help') return sendHelpGuide(chatId, admin);
      if (nav === 'menu') {
        return bot.sendMessage(chatId,
          `⚡ *${config.botName} Control* — main menu`,
          { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard(admin) });
      }
      if (nav === 'pair') {
        return bot.sendMessage(chatId,
          admin
            ? `🔑 *Pair a number*\n\nSend: \`/pair <number>\` — e.g. \`/pair 233533416608\`\nThe pairing code will land right here in this chat.`
            : `🔑 *Pair a number*\n\nSend: \`/pair <number>\` — e.g. \`/pair 233533416608\`\nYour request goes to the admins for approval.`,
          { parse_mode: 'Markdown', reply_markup: backKeyboard() });
      }
      if (nav === 'reload' || nav === 'requests') {
        if (!admin) return bot.answerCallbackQuery(query.id, { text: 'Admins only.' });
        if (nav === 'reload') {
          const status = await bot.sendMessage(chatId, `🔄 Reconnecting all saved sessions…`);
          await resumeExtraSessions();
          return bot.editMessageText(`✅ Saved sessions reconnecting — check Sessions in a minute.`,
            { chat_id: chatId, message_id: status.message_id, parse_mode: 'Markdown' });
        }
        const all = getPairRequests();
        if (!all.length) return bot.sendMessage(chatId, `No pending pairing requests.`, { reply_markup: backKeyboard() });
        const lines = all.map((r, i) => `${i + 1}. +${r.phone} — ${r.name || 'unknown'} • filed ${new Date(r.ts).toISOString().slice(11, 16)} UTC`);
        return bot.sendMessage(chatId,
          `📋 *Pending Pairing Requests (${all.length})*\n\n${lines.join('\n')}\n\nApprove: \`/pairapprove <number>\` · Deny: \`/pairdeny <number>\``,
          { parse_mode: 'Markdown', reply_markup: backKeyboard() });
      }
      return bot.answerCallbackQuery(query.id);
    }

    // ── Pairing approval buttons (admins only) ─────────────────────────
    if (!isAdmin(query.from)) {
      return bot.answerCallbackQuery(query.id, { text: 'Admins only.' });
    }
    const approve = data.startsWith('papprove:');
    const deny = data.startsWith('pdeny:');
    if (!approve && !deny) return bot.answerCallbackQuery(query.id);
    const phone = normalizePhone(data.split(':')[1]);
    const req = peekPairRequest(phone);
    if (!req) {
      await bot.answerCallbackQuery(query.id, { text: 'That request no longer exists.' });
      return bot.editMessageText(`~~${query.message?.text || 'Request'}~~\n\n(nobody acted on this in time)`, {
        chat_id: query.message?.chat?.id,
        message_id: query.message?.message_id,
        parse_mode: 'Markdown',
      }).catch(() => {});
    }

    if (deny) {
      removePairRequest(req.phone);
      await notifyRequester(req.dmJid, `🚫 Your pairing request for *+${req.phone}* was denied.`);
      await bot.answerCallbackQuery(query.id, { text: 'Denied.' });
      return bot.editMessageText(`📶 Pairing request for +${req.phone} — *DENIED* ✅`, {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'Markdown',
      }).catch(() => {});
    }

    await bot.answerCallbackQuery(query.id, { text: 'Approving…' });
    try {
      await pairSession(req.phone, { notifyJid: req.dmJid });
      removePairRequest(req.phone);
      await notifyRequester(req.dmJid, `✅ *Your pairing request for +${req.phone} was APPROVED!* The code arrives next — enter it within a couple of minutes.`);
      await bot.editMessageText(`📶 Pairing request for +${req.phone} — *APPROVED* ✅ — code delivering to the requester.`, {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'Markdown',
      }).catch(() => {});
    } catch (err) {
      await bot.answerCallbackQuery(query.id, { text: `Failed: ${err.message || err}` });
    }
  });

  // ── /unpair <number> ────────────────────────────────────────────────
  bot.onText(/\/unpair(?:\s+(\S+))?/, async (msg, match) => {
    if (!isAdmin(msg.from)) return reply(msg.chat.id, `🔒 Admin only.`);
    if (!match?.[1]) return reply(msg.chat.id, `Usage: \`/unpair <number>\``);
    try {
      const res = await removeSession(match[1]);
      await reply(msg.chat.id, `✅ *+${res.phone}* unpaired and logged out.`);
    } catch (err) {
      await reply(msg.chat.id, `❌ ${err.message || err}`);
    }
  });

  // ── /logoutall (owner) ───────────────────────────────────────────────
  bot.onText(/\/logoutall/, async (msg) => {
    if (!isOwner(msg.from)) return reply(msg.chat.id, `🔒 Owner only.`);
    const status = await bot.sendMessage(msg.chat.id, `⏳ Logging out every paired session…`);
    const results = await removeAllSessions();
    const ok = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok)
      .map((r) => `+${r.phone}: ${r.error}`).join('\n') || 'none';
    await bot.editMessageText(
      `🧹 *Fleet wiped:* ${ok} session(s) logged out.\n\n${failed !== 'none' ? `⚠️ Failures:\n${failed}` : ''}`,
      { chat_id: msg.chat.id, message_id: status.message_id, parse_mode: 'Markdown' });
  });

  // ── /reload (admin) ──────────────────────────────────────────────────
  bot.onText(/\/reload/, async (msg) => {
    if (!isAdmin(msg.from)) return reply(msg.chat.id, `🔒 Admin only.`);
    const status = await bot.sendMessage(msg.chat.id, `🔄 Reconnecting all saved sessions…`);
    await resumeExtraSessions();
    await bot.editMessageText(`✅ Saved sessions reconnecting — check /sessions in a minute.`,
      { chat_id: msg.chat.id, message_id: status.message_id, parse_mode: 'Markdown' });
  });

  // ── /broadcast <text> (owner) ───────────────────────────────────────
  bot.onText(/\/broadcast(?:\s+([\s\S]+))?/, async (msg, match) => {
    if (!isOwner(msg.from)) return reply(msg.chat.id, `🔒 Owner only.`);
    const text = match?.[1]?.trim();
    if (!text) return reply(msg.chat.id, `Usage: \`/broadcast <message>\` — sends to every group of every linked session.`);
    const sockets = activeSessionSockets();
    if (!sockets.length) return reply(msg.chat.id, `⚠️ No online sessions to broadcast through.`);

    const status = await bot.sendMessage(msg.chat.id, `📢 Broadcasting to ${sockets.length} session(s)…`);
    let totalSent = 0;
    const failures = [];
    for (const { phone, sock } of sockets) {
      try {
        const chats = await sock.groupFetchAllParticipating();
        for (const g of Object.keys(chats)) {
          try {
            await sock.sendMessage(g, { text });
            totalSent += 1;
          } catch (err) {
            failures.push(`+${phone} → group ${g.split('@')[0]}: ${err.message || err}`);
          }
          await new Promise((r) => setTimeout(r, 600));
        }
      } catch (err) {
        failures.push(`+${phone} (group list failed): ${err.message || err}`);
      }
    }
    const failBlock = failures.length ? `\n\n⚠️ *${failures.length} failure(s):*\n${failures.slice(0, 10).join('\n')}${failures.length > 10 ? `\n…+${failures.length - 10} more` : ''}` : '';
    await bot.editMessageText(clip(`✅ Broadcast complete — *${totalSent}* group(s) reached.${failBlock}`),
      { chat_id: msg.chat.id, message_id: status.message_id, parse_mode: 'Markdown' });
  });

  // ── /addadmin <id> (owner) ───────────────────────────────────────────
  bot.onText(/\/addadmin(?:\s+(\S+))?/, async (msg, match) => {
    if (!isOwner(msg.from)) return reply(msg.chat.id, `🔒 Owner only.`);
    const id = match?.[1]?.replace(/[^0-9]/g, '');
    if (!id) return reply(msg.chat.id, `Usage: \`/addadmin <telegram_user_id>\``);
    const admins = readAdmins();
    if (!admins.includes(id)) {
      admins.push(id);
      writeAdmins(admins);
    }
    await reply(msg.chat.id, `✅ Admin added: ${id}`);
  });

  console.log(`[TG] Telegram control panel started (NEXORA fleet up to ${MAX_EXTRA_SESSIONS} sessions).`);
  return bot;
}
