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
import { sendRich, renderTable, esc } from './rich.js';
import { verifyPairingGate, SUPPORT_GROUP_LINK, CHANNEL_LINK } from './gate.js';
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


  // ── Community-gate UI — join/follow buttons used across the panel ──
  const gateButtons = (phone) => ({
    inline_keyboard: [
      [{ text: '👥 Join Support Group', url: SUPPORT_GROUP_LINK }],
      [{ text: '📣 Follow Channel', url: CHANNEL_LINK }],
      [{ text: '✅ I’ve joined both — check again', callback_data: `recheck:${phone}` }],
    ],
  });
  const joinFollowRow = [
    { text: '👥 Join Support Group', url: SUPPORT_GROUP_LINK },
    { text: '📣 Follow Channel', url: CHANNEL_LINK },
  ];

  /**
   * Full self-service pairing flow behind the community gate. Shared by
   * /pair and the `recheck:` callback button. `editMessage` (optional)
   * reuses an existing status message instead of sending a new one.
   */
  async function runCommunityGate(chatId, phone, { from, editMessage } = {}) {
    const edit = (text, extra = {}) =>
      editMessage
        ? bot.editMessageText(text, { chat_id: chatId, message_id: editMessage.message_id, parse_mode: 'Markdown', ...extra })
        : bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...extra });

    let status = editMessage;
    if (!status) {
      status = await bot.sendMessage(chatId, `⏳ Checking *+${phone}* against the support group and channel…`, { parse_mode: 'Markdown' });
    }

    let gate;
    try {
      gate = await verifyPairingGate(phone);
    } catch (err) {
      gate = { pass: null, note: err?.message || String(err) };
    }

    // Not through the gate — show the join/follow buttons and a recheck button
    if (gate.pass === false) {
      const missing = [];
      if (!gate.groupOk) missing.push('the support group');
      if (!gate.channelOk) missing.push('the channel');
      return edit(
        `🔒 *+${phone} isn't through the community gate yet.*\n\n` +
        `You must join *both* first — still missing: ${missing.join(' and ')}.\n` +
        `Tap the buttons below, then press *check again*.`,
        { reply_markup: gateButtons(phone) });
    }

    // Technical failure — degrade to the admin approval queue (gating intact)
    if (gate.pass === null) {
      try {
        const { req } = addPairRequest(phone, {
          dmJid: telegramJid(chatId),
          chatJid: telegramJid(chatId),
          name: from?.first_name || from?.username || 'unknown',
        });
        await edit(
          `⚠️ Couldn't verify the community gate right now (${gate.note || 'verification unavailable'}). ` +
          `Your request for *+${req.phone}* went to the admin queue instead — you'll be approved shortly.`);
        await notifyAdminsOfRequest(req, from);
      } catch (err) {
        await edit(`❌ *Request rejected:* ${err.message || err}`);
      }
      return;
    }

    // Gate passed — pair directly, code delivered to THIS chat
    try {
      await pairSession(phone, { notifyJid: telegramJid(chatId) });
      await edit(
        `🔌 *Pairing channel open for +${phone}.*\n\n` +
        `${gate.advisory ? '(Channel follow could not be confirmed — counted on trust.)\n\n' : ''}` +
        `The code arrives in the next message — enter it on that phone within a couple of minutes:\n` +
        `WhatsApp → Settings → Linked Devices → Link a Device → *Link with phone number instead*.`);
    } catch (err) {
      await edit(`❌ *Pairing failed:* ${err.message || err}`);
    }
  }

/** Push a pairing-request card to every admin with Approve/Deny buttons.
 *  Used by the /pair fallback path when the community gate can't verify. */
async function notifyAdminsOfRequest(req, from) {
  const adminIds = new Set([
    String(process.env.TELEGRAM_OWNER_ID || ''),
    ...(process.env.TELEGRAM_ADMIN_IDS || '').split(',').map((s) => s.trim()),
    ...readAdmins(),
  ].filter(Boolean));
  const card = `📶 *PAIRING REQUEST*\n\nNumber: +${req.phone}\nRequested by: ${from?.first_name || from?.username || 'unknown'}\n\nApproving sends the pairing code to the requester's chat. Requests expire after ~15 minutes.`;
  const keyboard = {
    inline_keyboard: [[
      { text: '✅ Approve', callback_data: `papprove:${req.phone}` },
      { text: '❌ Deny', callback_data: `pdeny:${req.phone}` },
    ]],
  };
  for (const adminId of adminIds) {
    try { await bot.sendMessage(adminId, clip(card), { parse_mode: 'Markdown', reply_markup: keyboard }); } catch (_) {}
  }
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
    const rows = all.map((sn, i) => [
      String(i + 1),
      '+' + sn.phone,
      (sn.name || '—'),
      `${icon(sn.status)} ${sn.status}`,
      sn.connectedAt ? up(sn.connectedAt) : '—',
    ]);
    const notes = all
      .filter((sn) => sn.lastError && sn.status !== 'online')
      .map((sn) => `⚠️ +${sn.phone}: ${esc(sn.lastError)}`);
    await sendRich(bot, chatId, {
      title: `📋 Linked Sessions (${all.length}/${MAX_EXTRA_SESSIONS})`,
      sections: [
        { table: { headers: ['#', 'Number', 'Name', 'Status', 'Since UTC'], rows } },
        ...(notes.length ? [{ text: notes.join('\n') }] : []),
      ],
      keyboard: sessionsKeyboard(),
    });
  }

  async function sendHelpGuide(chatId, admin) {
    const cmd = (syntax, desc) => `<code>${esc(syntax)}</code> — ${esc(desc)}`;
    return sendRich(bot, chatId, {
      title: `📚 ${config.botName} Telegram Command Guide`,
      sections: [
        { heading: '🔑 Pairing', text:
          '<blockquote>' + [
            cmd('/pair 233XXXXXXXXX', 'link a number — self-service for everyone, no admin approval needed'),
            cmd('/pairapprove [number]', 'approve a pending request (admin)'),
            cmd('/pairdeny [number]', 'deny a pending request (admin)'),
            cmd('/pairrequests', 'request queue (admin)'),
            cmd('/unpair <number>', 'remove a linked session (admin)'),
          ].join('\n') + '</blockquote>' },
        { heading: '🚀 Fleet', text:
          '<blockquote>' + [
            cmd('/sessions', 'every session, live status'),
            cmd('/reload', 'reconnect all saved sessions (admin)'),
            cmd('/logoutall', 'wipe the whole fleet (owner)'),
            cmd('/broadcast <text>', 'send to all groups of all sessions (owner)'),
          ].join('\n') + '</blockquote>' },
        { heading: '🛡 Admin', text:
          '<blockquote>' + [
            cmd('/addadmin <id>', 'grant admin (owner)'),
            cmd('/ping', 'latency check'),
          ].join('\n') + '</blockquote>' },
        { text: '🔐 <b>Community gate</b> — self-pairing requires the number to be in the support group and following the channel:\n👥 ' + esc(SUPPORT_GROUP_LINK) + '\n📣 ' + esc(CHANNEL_LINK) + '\nAdmins keep the direct-pair bypass; approval commands still cover fallback cases.' },
        { text: '⚡ <b>Major WhatsApp commands</b> — <code>.menu</code> · <code>.rank</code> · <code>.profile</code> · <code>.balance</code> · <code>.daily</code> · <code>.play</code> · <code>.wiki</code> · <code>.ai</code> · <code>.gacha</code> — all work unchanged on every linked number. Full list: <code>.menu</code> on WhatsApp.' },
      ],
      keyboard: mainMenuKeyboard(admin),
    });
  }

  // ── /start ──────────────────────────────────────────────────────────
  bot.onText(/\/start/, async (msg) => {
    const name = msg.from?.first_name || 'there';
    const admin = isAdmin(msg.from);
    // One native photo card: banner + caption + inline menu, single message
    await sendRich(bot, msg.chat.id, {
      image: BANNER_PATH,
      title: `⚡ Welcome to ${config.botName} Control, ${name}!`,
      sections: [
        { text: `Telegram command deck for your NEXORA WhatsApp multi-session fleet — up to <b>${MAX_EXTRA_SESSIONS} linked numbers</b>, each running the full NEXORA engine.` },
        { text: 'Anyone can self-pair a number — it just has to be in the <b>support group</b> and following the <b>channel</b> first.' },
        { text: admin ? 'You are an <b>admin</b> here. Core commands:' : 'Core commands:' },
        { text: '<code>/pair &lt;number&gt;</code> — link a WhatsApp number\n<code>/sessions</code> — fleet status\n<code>/help</code> — full command guide' },
        { text: '⚡ <b>Major WhatsApp commands</b> — they run on every linked number: <code>.menu</code> · <code>.rank</code> · <code>.balance</code> · <code>.daily</code> · <code>.play</code> · <code>.wiki</code> · <code>.ai</code> · <code>.gacha</code>' },
      ],
      keyboard: {
        inline_keyboard: [
          joinFollowRow,
          [{ text: '⚡ WhatsApp Commands', callback_data: 'nav:cmds' }],
          ...mainMenuKeyboard(admin).inline_keyboard,
        ],
      },
    });
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
      return sendRich(bot, chatId, {
        title: '📱 Link a WhatsApp number',
        sections: [
          { text: 'Usage: <code>/pair 233XXXXXXXXX</code> — include the country code, no + or spaces.' },
          { text: 'Anyone can self-pair — no admin approval. But the number must join <b>both</b> first:' },
        ],
        keyboard: { inline_keyboard: [joinFollowRow, [{ text: '❓ Help', callback_data: 'nav:help' }]] },
      });
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

    // ── Everyone else: self-service pairing behind the community gate ──
    // No admin approval needed — the WhatsApp number must be in the support
    // group AND following the channel first. Admin approval queue is only
    // the fallback when verification is technically impossible.
    await runCommunityGate(chatId, phone, { from: msg.from });
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

    // ── Community-gate recheck button ─────────────────────────────────
    if (data.startsWith('recheck:')) {
      const phone = normalizePhone(data.slice(8));
      const chatId = query.message?.chat?.id;
      if (!chatId || !phone) return bot.answerCallbackQuery(query.id);
      await bot.answerCallbackQuery(query.id, { text: 'Checking both again…' });
      return runCommunityGate(chatId, phone, { from: query.from, editMessage: query.message });
    }

    // ── Navigation buttons (open to everyone; admin-only ones gated) ──
    if (data.startsWith('nav:')) {
      const chatId = query.message?.chat?.id;
      const admin = isAdmin(query.from);
      const nav = data.slice(4);
      if (!chatId) return bot.answerCallbackQuery(query.id);
      await bot.answerCallbackQuery(query.id, { text: 'Loading…' });
      if (nav === 'cmds') {
        await sendRich(bot, chatId, {
          title: '⚡ Major WhatsApp Commands',
          sections: [
            { text: 'Every linked number runs the full NEXORA engine — these are the headliners. Send them from the WhatsApp side as shown:' },
            { text: '<b>Core</b>\n<code>.menu</code> — the full 227-plugin command menu\n<code>.ping</code> — latency check\n<code>.alive</code> — heartbeat + uptime\n<code>.profile</code> — your NEXORA profile card' },
            { text: '<b>Economy &amp; RPG</b>\n<code>.balance</code> — coins &amp; bank\n<code>.daily</code> — daily reward claim\n<code>.work</code> — earn coins\n<code>.shop</code> — spend them\n<code>.slots</code> · <code>.duel</code> · <code>.gacha</code> — gamble &amp; PvP\n<code>.leaderboard</code> — global rankings' },
            { text: '<b>Media &amp; Info</b>\n<code>.play &lt;song&gt;</code> — music download\n<code>.wiki &lt;topic&gt;</code> — rich Wikipedia cards\n<code>.sticker</code> — make stickers\n<code>.ai &lt;prompt&gt;</code> — the AI suite' },
          ],
          footer: 'Full list on WhatsApp: .menu or .menulist — Pairing happens here on Telegram.',
          keyboard: { inline_keyboard: [
            joinFollowRow,
            [{ text: '⬅️ Menu', callback_data: 'nav:menu' }],
          ] },
        });
        return;
      }
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
            : `🔑 *Pair a number*\n\nSend: \`/pair <number>\` — e.g. \`/pair 233533416608\`\nNo admin approval needed — just join the group and follow the channel first (buttons below).`,
          { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [joinFollowRow, [{ text: '⬅️ Menu', callback_data: 'nav:menu' }]] } });
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
