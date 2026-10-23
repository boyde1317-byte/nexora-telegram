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
import { mdToHtml, esc, sendRich, buildKeyboard } from './rich.js';
import { messageFormatter } from '../ui/messageFormatter.js';
import { hasRichPayload, renderRichToTelegram, hasRichProtoMessage, renderRichProtoToTelegram } from './richInbound.js';

/** The Telegram bot instance — injected at boot via attachBot(). */
let bot = null;

/** Curated majors surfaced with dedicated slash commands + buttons. */
export const MAJOR_COMMANDS = [
  'menu', 'menulist', 'ping', 'alive', 'about',
  'rank', 'profile', 'balance', 'daily', 'work', 'shop',
  'slots', 'duel', 'gacha', 'leaderboard', 'transfer',
  'wiki', 'play', 'ai', 'define', 'calc', 'owner',
  'check', 'checkwa',
  'simi', 'muslimai', 'feelbetter', 'tts', 'transkrip', 'primbon',
  'tempnumber',
];

export function attachBot(instance) { bot = instance; }

/**
 * Pending picker actions (wcr:) — inline-keyboard buttons can only carry
 * 64 bytes of callback_data, and a picker row's command (`.play <youtube
 * url>`) is longer than that. So the translation layer parks the full
 * command string here under a short id and the keyboard button carries
 * `wcr:<id>`. Bounded at 200 entries; pickers are ephemeral anyway.
 */
const pendingActions = new Map();
let pendingSeq = 0;

export function registerPendingAction(cmd) {
  const id = String(++pendingSeq);
  pendingActions.set(id, String(cmd).replace(/^\./, ''));
  if (pendingActions.size > 200) {
    pendingActions.delete(pendingActions.keys().next().value);
  }
  return id;
}

/** Run a parked picker action on behalf of the tapping admin. */
export async function runPendingAction(chatId, id) {
  const cmdStr = pendingActions.get(String(id));
  if (!cmdStr) {
    return { ok: false, message: '⌛ That picker expired — run the command again.' };
  }
  const [name, ...args] = cmdStr.trim().split(/\s+/);
  if (!name) return { ok: false, message: '⌛ That picker expired — run the command again.' };
  return runWhatsAppCommand(chatId, name, args);
}

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
 * Button spec (flat or baileys shape) → Telegram inline button, or null
 * when the type has no sensible Telegram equivalent.
 */
function toTelegramButton(btn) {
  const label = (btn.text || btn.displayText || btn.buttonText?.displayText || '').trim();
  if (!label) return null;
  if (btn.url) return { text: label, url: btn.url };
  const id = btn.id || btn.buttonId || '';
  if (/^https?:\/\//i.test(id)) return { text: label, url: id };
  if (id && id !== 'select_menu' && id !== 'noop') {
    // quick_reply style: id is the command to run on tap (`.play <url>`)
    return { text: label, callback: `wcr:${registerPendingAction(id)}` };
  }
  return null;
}

/**
 * Extract the plain-text fallback from any relayed interactive payload.
 */
function relayFallbackText(content) {
  return content?.buttonsMessage?.contentText
    || content?.interactiveMessage?.body?.text
    || content?.text
    || '';
}

/**
 * Translate a WhatsApp interactive payload (selectMenu's buttonsMessage or a
 * relayed interactiveMessage) into a native Telegram card: numbered option
 * list in the body plus a tappable inline keyboard. Never throws — degrades
 * to plain text.
 */
export async function renderButtonsCard(chatId, content) {
  const bm = content?.buttonsMessage;
  const im = content?.interactiveMessage;
  if (!bm && !im) return pushText(chatId, relayFallbackText(content));

  const bodyLines = [];
  const buttons = [];
  let n = 0;

  const pushRow = (row, params) => {
    n += 1;
    // selectMenu rows often ship their own "1." numbering in the title —
    // strip it so it doesn't double up with ours.
    const title = String(row.title || 'Option').replace(/^\d+\.\s*/, '');
    bodyLines.push(
      `<b>${n}.</b> ${esc(title)}` +
      (row.description ? `\n    <i>${esc(row.description)}</i>` : '')
    );
    if (n <= 10 && row.id != null) {
      buttons.push({ text: `${n} ${title}`.slice(0, 60), callback: `wcr:${registerPendingAction(row.id)}` });
    }
    return n;
  };

  for (const btn of (bm?.buttons || [])) {
    if (btn.nativeFlowInfo?.name === 'single_select') {
      try {
        const params = JSON.parse(btn.nativeFlowInfo.paramsJson || '{}');
        for (const section of params.sections || []) {
          for (const row of section.rows || []) pushRow(row, params);
        }
      } catch (_) { console.warn('[TG-CMD] unparseable picker paramsJson — listing options only'); }
      continue;
    }
    const tb = toTelegramButton(btn);
    if (tb) buttons.push(tb);
  }

  // Relayed interactiveMessage — the fork packs its buttons under
  // nativeFlowMessage with JSON-encoded params per button type.
  for (const btn of (im?.nativeFlowMessage?.buttons || [])) {
    const params = (() => { try { return JSON.parse(btn.buttonParamsJson || '{}'); } catch (_) { return null; } })();
    if (btn.name === 'single_select' && params) {
      for (const section of params.sections || []) {
        for (const row of section.rows || []) pushRow(row, params);
      }
    } else if (btn.name === 'quick_reply' && params) {
      const tb = toTelegramButton({ text: params.displayText || '', id: params.data || '' });
      if (tb) buttons.push(tb);
    }
  }

  const sections = [];
  const header = [bm?.locationMessage?.name, bm?.locationMessage?.address]
    .filter(Boolean).join(' • ');
  if (bm && header) sections.push({ text: `<b>${esc(header)}</b>` });
  if (im?.header?.title) sections.push({ text: `<b>${esc(im.header.title)}</b>` });
  if (bm?.contentText) sections.push({ text: mdToHtml(bm.contentText) });
  if (im?.body?.text) sections.push({ text: mdToHtml(im.body.text) });
  if (bodyLines.length) sections.push({ text: bodyLines.join('\n') });

  return await sendRich(bot, chatId, {
    image: bm?.locationMessage?.jpegThumbnail || null,
    sections,
    footer: bm?.footerText || im?.footer?.text,
    ...(buttons.length ? { buttons } : {}),
  });
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

    // WhatsApp rich-response payload (tables, code, galleries, LaTeX image
    // content…) → translate to native Telegram output instead of losing it.
    if (hasRichPayload(content)) {
      const ok = await renderRichToTelegram(bot, chatId, content).catch((e) => {
        console.warn('[TG-CMD] rich payload translation failed:', e?.message || e);
        return false;
      });
      if (ok) return;
      // fall through to the simple content routing below
    }

    // Interactive nativeFlow payload (mixedCard / sendNativeFlow output):
    // buttons would be silently dropped by the simple routing below —
    // render a native Telegram card with an inline keyboard instead.
    if (Array.isArray(content?.nativeFlow) && content.nativeFlow.length) {
      const buttons = content.nativeFlow.map(toTelegramButton).filter(Boolean);
      try {
        return await sendRich(bot, chatId, {
          image: content.image || null,
          title: content.title || '',
          sections: [
            ...(content.caption ? [{ text: mdToHtml(content.caption) }] : []),
            ...(content.text ? [{ text: mdToHtml(content.text) }] : []),
          ],
          footer: content.footer,
          ...(buttons.length ? { buttons } : {}),
        });
      } catch (err) {
        console.warn('[TG-CMD] nativeFlow translation failed, falling back:', err.message || err);
      }
    }

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
  // Interactive sends (selectMenu / sendButtonsCard) go through
  // sock.relayMessage, NOT sendMessage — relay them to Telegram too, or
  // they'd hit the real WhatsApp socket with the `tg:` pseudo-JID (and the
  // Baileys generator crashes on the mock `quoted` message).
  const routeTelegramRelay = async (target, content, opts = {}) => {
    const isTgTarget = typeof target === 'string'
      && (target.startsWith('tg:') || target === fromJid);
    if (!isTgTarget) return realSock.relayMessage(target, content, opts);
    if (!bot) return pushText(chatId, relayFallbackText(content));
    // Generated rich cards (.testrich generators, AIRich combos, maps) relay
    // as richResponseMessage proto — build a rich Telegram card from them,
    // not the plain-text fallback.
    if (hasRichProtoMessage(content)) {
      try {
        const ok = await renderRichProtoToTelegram(bot, chatId, content);
        if (ok) return true;
      } catch (err) {
        console.warn('[TG-CMD] rich proto translation failed:', err?.message || err);
      }
    }
    try {
      return await renderButtonsCard(chatId, content);
    } catch (err) {
      console.warn('[TG-CMD] relay payload translation failed:', err?.message || err);
      return pushText(chatId, relayFallbackText(content));
    }
  };

  return new Proxy(realSock, {
    get(target, prop, receiver) {
      if (prop === 'sendMessage') return routeTelegram;
      if (prop === 'relayMessage') return routeTelegramRelay;
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

  const bodyText = argList.join(' ');
  const m = {
    from: fromJid,
    sender: ownerJid,
    // Real message content shape — baileys' generateWAMessageFromContent
    // reads quoted.message when this mock is passed as { quoted: m }
    // (interactive sends), and plugins expect m.msg / m.message too.
    message: { conversation: bodyText },
    key: { remoteJid: fromJid, fromMe: true, id: `TGCMD${Date.now()}` },
    isGroup: false,
    fromMe: true,
    pushName: 'Telegram',
    body: bodyText,
    msg: { conversation: bodyText },
    mentionedJid: [],
    quoted: null,
    isOwner: true,
    isAdmin: async () => true,
    isBotAdmin: async () => true,
    react: async () => {},
    download: async () => { throw new Error('Media download is not available from the Telegram panel — send media on WhatsApp instead.'); },
    reply: async (text) => pushText(chatId, text),
  };
  // Mirror the WhatsApp reply API (src/core/serializer.js) so every plugin
  // helper — m.reply.info / .success / .error / .warn / .loading — works
  // identically when a command runs from the Telegram panel.
  m.reply.success = async (text) => pushText(chatId, messageFormatter.success(text));
  m.reply.error   = async (text) => pushText(chatId, messageFormatter.error(text));
  m.reply.warn    = async (text) => pushText(chatId, messageFormatter.warn(text));
  m.reply.info    = async (text, title = 'INFO') => pushText(chatId, messageFormatter.info(text, title));
  m.reply.loading = async (text = 'Processing...') => pushText(chatId, messageFormatter.loading(text));

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
