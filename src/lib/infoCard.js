/**
 * @file src/lib/infoCard.js
 *
 * Reusable "info card" renderer — extracts the visual pattern from the
 * `.info` / `.about` command into a single callable so other info-display
 * commands (stats, userinfo, taginfo, groupinfo, connection, middleware,
 * etc.) can share the same look without duplicating 60 lines of boilerplate.
 *
 * Visual stack:
 *   1. Product quote (productMessage in reply bar) with thumbnail
 *   2. sendButtonsCard with:
 *      - body   → short headline (renders as normal foreground text)
 *      - footer → detailed stats (renders as WhatsApp native grey footer)
 *      - title  → card title (brand name)
 *      - thumbnail → bot logo header image
 *      - buttons → pill row (quick-reply + navigation picker)
 *   3. Tier 2: nativeFlow fallback
 *   4. Tier 3: plain text fallback
 *
 * Usage:
 *   import { sendInfoCard } from '../../lib/infoCard.js';
 *   await sendInfoCard(sock, m.from, {
 *     body:     `User: @${num}`,
 *     footer:   `*»* *PROFILE*\n  › *Level:* ${level}\n  › *XP:* ${xp}`,
 *     buttons:  [{ displayText: '☰ Menu', id: `${p}menu`, type: 1 }],
 *     mentions: [m.sender],
 *     prefix:   p,
 *   }, { quoted: m });
 */

import { baileysBridge } from '../core/baileysBridge.js';
import { capabilities } from '../core/capabilities.js';
import { buildFakeProductQuote } from './waUtils.js';
import { buildNavigationButton } from '../menu/types/buttonsCard.js';
import { ASSET_URLS } from '../assets/assetUrls.js';
import brand from '../../config/brand.js';

/**
 * Send an info card with product quote + buttonsCard.
 *
 * @param {object} sock        Baileys socket
 * @param {string} jid         Recipient JID
 * @param {object} card        Card configuration
 * @param {string} card.body   Short headline text (normal foreground)
 * @param {string} card.footer Detailed stats (WhatsApp grey footer text)
 * @param {string} [card.title]        Card title (default: brand.name)
 * @param {string} [card.subtitle]     Card subtitle
 * @param {string} [card.thumbnail]    Thumbnail URL for header image
 * @param {Array}  [card.buttons]      Button array; defaults to [Menu + Nav]
 * @param {Array}  [card.mentions]     JIDs to mention
 * @param {string} [card.prefix]       Command prefix for default buttons
 * @param {object} [card.productQuote] Override product quote options
 * @param {object} [opts]              sendMessage options ({ quoted: m })
 * @returns {Promise<object>} Relayed WAMessage
 */
export async function sendInfoCard(
  sock,
  jid,
  {
    body,
    footer,
    title,
    subtitle,
    thumbnail,
    buttons,
    mentions = [],
    prefix = '.',
    productQuote = {},
  } = {},
  opts = {}
) {
  const quoteMessage = opts.quoted;
  const thumbUrl = thumbnail || ASSET_URLS.thumbnail;
  const cardTitle = title || brand.name;

  // ── Download thumbnail buffer for product quote ────────────────────────
  let thumbBuf = null;
  try {
    const res = await fetch(thumbUrl, { signal: AbortSignal.timeout(8000) });
    if (res.ok) thumbBuf = Buffer.from(await res.arrayBuffer());
  } catch (_) {}

  // ── Build product quote (productMessage in reply bar) ──────────────────
  let contextInfo;
  try {
    const catalogQuote = buildFakeProductQuote({
      title:            productQuote.title || cardTitle,
      description:      productQuote.description || brand.description || `${brand.name} by ${brand.creator}`,
      currencyCode:     productQuote.currencyCode || 'USD',
      priceAmount1000:  productQuote.priceAmount1000 ?? 0,
      businessOwnerJid: productQuote.businessOwnerJid || '0@s.whatsapp.net',
      ...(thumbBuf ? { jpegThumbnail: thumbBuf } : {}),
      ...productQuote,
    });
    contextInfo = {
      stanzaId:      catalogQuote.key.id || 'info-card',
      participant:   catalogQuote.key.participant,
      remoteJid:     catalogQuote.key.remoteJid,
      quotedMessage: catalogQuote.message,
      mentionedJid:  mentions,
    };
  } catch (err) {
    console.warn('[infoCard] Product quote build failed:', err.message);
    contextInfo = { mentionedJid: mentions };
  }

  // ── Default buttons: quick-reply + navigation picker ───────────────────
  const effectiveButtons = buttons || [
    { displayText: '\u2630 Menu', id: `${prefix}menu`, type: 1 },
    buildNavigationButton(prefix),
  ];

  // ── Tier 1: sendButtonsCard ────────────────────────────────────────────
  if (capabilities.nativeFlow) {
    try {
      return await baileysBridge.sendButtonsCard(sock, jid, {
        body:      body,
        footer:    footer,
        title:     cardTitle,
        subtitle:  subtitle,
        thumbnail: thumbUrl,
        buttons:   effectiveButtons,
        contextInfo,
      }, { quoted: quoteMessage });
    } catch (err) {
      console.warn('[infoCard] Tier 1 (buttonsCard) failed:', err.message);
    }
  }

  // ── Tier 2: nativeFlow fallback ─────────────────────────────────────────
  if (capabilities.nativeFlow) {
    try {
      return await baileysBridge.sendNativeFlow(sock, jid, {
        text:    `${body}\n\n${footer}`,
        footer:  `\u00A9 ${brand.name} by ${brand.creator}`,
        title:   cardTitle,
        image:   { url: thumbUrl },
        buttons: effectiveButtons.map(b => ({
          text: b.displayText || b.text || 'Button',
          id:   b.id || `${prefix}menu`,
        })),
      }, { quoted: quoteMessage });
    } catch (err) {
      console.warn('[infoCard] Tier 2 (nativeFlow) failed:', err.message);
    }
  }

  // ── Tier 3: plain text fallback ─────────────────────────────────────────
  return await sock.sendMessage(jid, {
    text:     `*${cardTitle}*\n\n${body}\n\n${footer}`,
    mentions: mentions,
  }, { quoted: quoteMessage });
}

export default sendInfoCard;
