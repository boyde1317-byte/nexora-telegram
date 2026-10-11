/**
 * commander.js — run real NEXORA WhatsApp-side plugin commands from Telegram.
 *
 * The Telegram panel is a control deck for the fleet's MAIN session: an
 * admin types /rank, /balance, /wiki … (or taps a button) and the actual
 * engine plugin executes — same db, same economy, same card engine — with
 * one seam: every reply, card, or download the plugin produces is routed
 * to the requesting Telegram chat instead of a WhatsApp socket.
 *
 * Identity policy: commands run AS the main session's linked number (the
 * owner's own account), so economy effects, cooldowns, and XP land on the
 * real account — exactly as if the owner typed them on WhatsApp. Because
 * of that, runner access is ADMIN-ONLY; non-admins get a refusal card.
 *
 * Output routing (sock.sendMessage is proxied):
 *   • { text }                    → HTML message (WhatsApp markdown converted)
 *   • { image, caption }          → native photo card (rank/level cards…)
 *   • { document, filename }     → file upload
 *   • { audio / video / sticker } → media upload
 *   • any other target JID        → passed through to the real socket
 */

import { client } from '../core/client.js';
import { db } from '../database/db.js';
import { config } from '../../config/index.js';
import { telegramJid, sendToTelegramChat } from './bridge.js';
import { mdToHtml } from './rich.js';

/** The Telegram bot instance — injected at boot via attachBot(). */
let bot = null;

/** Curated majors surfaced with dedicated slash commands + buttons. */
export const MAJOR_COMMANDS = [
  'menu', 'menulist', 'ping', 'alive', 'about',
  'rank', 'profile', 'balance', 'daily', 'work', 'shop',
  'slots', 'duel', 'gacha', 'leaderboard', 'transfer',
  'wiki', 'play', 'ai', 'define', 'calc', 'owner',
];

export function attachBot(instance) { bot = instance; }

/** Cooldown bookkeeping reuses the engine's own cooldown table. */
function enforceCooldown(chatId, command) {
  const key = `tg:${chatId}_${command.name}`;
  const now = Date.now();
  const last = client.cooldowns.get(key);
  const wait = command.cooldown ?? config.cooldownTime ?? 3000;
  if (last && now - last < wait) {
    const remain = Math.ceil((wait - (now - last)) / 1000);
    return `⏳ *${command.name}* is on cooldown — try again in ${remain}s.`;
  }
  client.cooldowns.set(key, now);
  return null;
}

/** Deliver a plugin text payload to the Telegram chat. */
async function pushText(chatId, text) {
  if (!text) return;
  await sendToTelegramChat(chatId, mdToHtml(String(text)), { parseMode: 'HTML' });
}

/**
 * Build the Telegram-routed sock proxy. sendMessage targeted at the
 * Telegram pseudo-JID is rendered natively; anything else (real group
 * ops, profile fetches) delegates to the live session socket.
 */
function makeProxySock(chatId, realSock, fromJid) {
  const routeTelegram = async (target, content) => {
    const isTgTarget = typeof target === 'string'
      && (target.startsWith('tg:') || target === fromJid);
    if (!isTgTarget) return realSock.sendMessage(target, content);
    if (!bot) return pushText(chatId, content?.text || '');
    try {
      if (content?.image != null) {
        return bot.sendPhoto(chatId, content.image, {
          caption: content.caption ? mdToHtml(content.caption) : undefined,
          parse_mode: 'HTML',
        });
      }
      if (content?.document != null) {
        return bot.sendDocument(chatId, content.document, { filename: content.filename });
      }
      if (content?.audio != null) {
        return bot.sendAudio(chatId, content.audio, { filename: content.filename });
      }
      if (content?.video != null) {
        return bot.sendVideo(chatId, content.video, { caption: content.caption ? mdToHtml(content.caption) : undefined, parse_mode: 'HTML' });
      }
      if (content?.sticker != null) {
        return bot.sendSticker(chatId, content.sticker);
      }
      if (content?.text) {
        return bot.sendMessage(chatId, mdToHtml(content.text), { parse_mode: 'HTML' });
      }
    } catch (err) {
      console.warn('[TG-CMD] media routing failed, falling back to text:', err.message || err);
    }
    return pushText(chatId, content?.text || content?.caption || '');
  };
  return new Proxy(realSock, {
    get(target, prop, receiver) {
      if (prop === 'sendMessage') return routeTelegram;
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/**
 * Execute a NEXORA plugin command for a Telegram admin.
 * Returns { ok, error?, message? }.
 */
export async function runWhatsAppCommand(chatId, rawName, argList = []) {
  if (!bot) return { ok: false, error: 'Telegram bot not attached yet' };
  const sock = client.socket;
  if (!sock?.user) return { ok: false, error: 'Main session is offline — link it first (see /sessions).' };

  const name = (rawName || '').toLowerCase().replace(/^\./, '');
  const resolved = client.aliases.get(name) || name;
  const command = client.commands.get(resolved);
  if (!command) {
    return { ok: false, message: `Unknown command .${name}. Try .menu on WhatsApp or /help here.` };
  }
  const ownerOnly = command.permissions?.owner ?? command.ownerOnly ?? false;
  if (ownerOnly) {
    // Fine on Telegram: the runner IS the owner's account. Proceed.
  }

  const cooldownHit = enforceCooldown(chatId, command);
  if (cooldownHit) return { ok: false, message: cooldownHit };

  const ownerJid = sock.user.id;
  const fromJid = telegramJid(chatId);
  const proxySock = makeProxySock(chatId, sock, fromJid);

  const m = {
    from: fromJid,
    sender: ownerJid,
    key: { remoteJid: fromJid, fromMe: true, id: `TGCMD${Date.now()}` },
    isGroup: false,
    fromMe: true,
    pushName: 'Telegram',
    body: argList.join(' '),
    mentionedJid: [],
    quoted: null,
    isOwner: true,
    isAdmin: async () => true,
    isBotAdmin: async () => true,
    react: async () => {},
    download: async () => { throw new Error('Media download is not available from the Telegram panel — send media on WhatsApp instead.'); },
    reply: async (text) => pushText(chatId, text),
  };
  m.reply.warn = async (text) => pushText(chatId, text);

  const ctx = {
    m,
    sock: proxySock,
    jid: fromJid,
    sender: ownerJid,
    args: [...argList],
    body: argList.join(' '),
    prefix: '.',
    isGroup: false,
    isOwner: true,
    rawMessage: null,
    db,
    client,
    config,
    reply: m.reply,
    react: m.react,
  };

  try {
    console.log(`[TG-CMD] .${command.name} ← telegram:${chatId} (as ${ownerJid.split('@')[0]})`);
    await command.execute(ctx);
    try { client.recordExecution(command.name, false); } catch (_) {}
    return { ok: true };
  } catch (err) {
    console.error('[TG-CMD] failed:', command.name, err.message || err);
    return { ok: false, error: err?.message || String(err), message: `❌ .${command.name} failed: ${err?.message || err}` };
  }
}
