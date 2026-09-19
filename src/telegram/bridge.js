/**
 * bridge.js — the only seam between the Telegram control panel and the
 * NEXORA core.
 *
 * The core (sessionManager.js) addresses notification targets as JIDs.
 * A Telegram chat is addressed with the pseudo-JID `tg:<chat_id>` and the
 * core routes any `tg:`-prefixed notify target through THIS module instead
 * of the WhatsApp socket — one line in notifyMain/notifyStatus, nothing
 * else in the engine changes.
 *
 * This module must stay dependency-free (no node-telegram-bot-api import):
 * the core imports it, and the core must never depend on Telegram. The
 * actual sending function is INJECTED by src/telegram/index.js at boot via
 * registerTelegramSender(). If the Telegram bot is not configured, every
 * call degrades to a silent no-op and NEXORA behaves exactly as before.
 */

/** Injected sender: async (chatId, text, opts) => {}. Registered by the bot. */
let sender = null;

/** Owner's Telegram chat — session lifecycle alerts are mirrored here. */
let ownerChat = null;

/** Is this notify target a Telegram chat? */
export function isTelegramJid(jid) {
  return typeof jid === 'string' && jid.startsWith('tg:');
}

/** Extract the numeric chat id from a `tg:` pseudo-JID. */
export function telegramChatOf(jid) {
  return isTelegramJid(jid) ? jid.slice(3) : null;
}

/** Build the `tg:` pseudo-JID for a Telegram chat id. */
export function telegramJid(chatId) {
  return `tg:${String(chatId)}`;
}

/**
 * The Telegram bot registers its send function here at boot.
 * fn(chatId, text, opts) — opts may carry { parseMode }.
 */
export function registerTelegramSender(fn) {
  sender = typeof fn === 'function' ? fn : null;
}

/** Remember the owner's Telegram chat for lifecycle-alert mirroring. */
export function setTelegramOwnerChat(chatId) {
  ownerChat = chatId != null ? String(chatId) : null;
}

/** Send to a raw Telegram chat id. Never throws. */
export async function sendToTelegramChat(chatId, text, opts = {}) {
  if (!sender || chatId == null) return false;
  try {
    await sender(String(chatId), text, opts);
    return true;
  } catch (err) {
    console.warn('[TG] delivery failed:', err.message || err);
    return false;
  }
}

/**
 * Deliver a notification to a notify target IF it is a Telegram chat.
 * Returns true when it was handled here — the caller then skips the
 * WhatsApp path entirely.
 */
export async function deliverNotification(notifyJid, text, opts = {}) {
  const chatId = telegramChatOf(notifyJid);
  if (chatId == null) return false;
  return sendToTelegramChat(chatId, text, opts);
}

/**
 * Mirror a session lifecycle alert to the owner's Telegram chat.
 * Skipped when the alert was ALREADY delivered to that same chat
 * (notifyJid === tg:<owner chat>) so nothing is double-sent.
 */
export async function mirrorSessionAlert(notifyJid, text) {
  if (!ownerChat || !sender) return;
  if (telegramChatOf(notifyJid) === ownerChat) return;
  await sendToTelegramChat(ownerChat, text);
}
