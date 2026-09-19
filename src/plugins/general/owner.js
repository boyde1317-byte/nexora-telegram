/**
 * owner.js — bot owner contact card.
 *
 * Sent via mixedCard (buttonsMessage) with a full button row
 * (call / chat / copy / quick_reply).
 *
 * Tier 1: mixedCard (buttonsMessage — call/url/copy/quick_reply buttons).
 * Tier 2: guaranteed styled asciiBuilder box (no bare plain text).
 *
 * carouselMessage was previously tried as Tier 1 here but was removed —
 * relayMessage resolves fine even when the recipient's client can't
 * render carouselMessage, so the try/catch fallback never actually
 * caught the real-world failure (users saw "your version of WhatsApp
 * doesn't support it").
 *
 * Owner number is intentionally hardcoded per product requirement — this is
 * a fixed contact card, not a per-deployment config value.
 */
import brand from '../../../config/brand.js';
import { getBrandThumbnail } from '../../lib/cosmetics.js';
import { mixedCard } from '../../lib/interactiveKit.js';
import { asciiBuilder } from '../../ui/asciiBuilder.js';

const OWNER_NUMBER = '233533416608';

function buildCaption() {
  return (
    `👑 *${brand.name.toUpperCase()} OWNER CARD*\n\n` +
    `Name: ${brand.creator}\n` +
    `Role: Developer & Bot Owner\n` +
    `Bot: ${brand.name}\n\n` +
    `Use the buttons below to call, chat, or copy the number.\n\n` +
    `_${brand.signature}_`
  );
}

export default {
  name: 'owner',
  aliases: ['creator', 'developer'],
  category: 'general',
  description: "Shows the bot owner's contact card.",
  cooldown: 3000,
  execute: async ({ sock, m, prefix }) => {
    const p = prefix || '.';
    const caption = buildCaption();
    const thumbnailUrl = await getBrandThumbnail();

    const buttons = [
      { text: 'Call Owner',        call: `+${OWNER_NUMBER}` },
      { text: '💬 Chat on WhatsApp',  url:  `https://wa.me/${OWNER_NUMBER}` },
      { text: '📋 Copy Number',       copy: OWNER_NUMBER },
      { text: 'ℹ️ About Bot',         id:   `${p}about` },
    ];

    // NOTE: carouselMessage (baileysBridge.sendCarousel) is NOT used here —
    // relayMessage resolves successfully even when the recipient's WA client
    // can't render carouselMessage, so a try/catch around sendCarousel never
    // actually catches the failure (it shows up as "your version of
    // WhatsApp doesn't support it" on their screen). mixedCard
    // (buttonsMessage-based) is the reliable path.

    // ── Tier 1: mixedCard (buttonsMessage — same buttons, reliable) ──────────
    try {
      return await mixedCard(sock, m.from, {
        text: caption,
        footer: brand.signature,
      }, [
        { kind: 'call',   label: 'Call Owner',       phone: `+${OWNER_NUMBER}` },
        { kind: 'url',    label: '💬 Chat on WhatsApp', url:   `https://wa.me/${OWNER_NUMBER}` },
        { kind: 'copy',   label: '📋 Copy Number',      value: OWNER_NUMBER },
        { kind: 'action', label: 'ℹ️ About Bot',        cmd:   `${p}about` },
      ], { quoted: m });
    } catch (err) {
      console.warn('[owner] Tier 2 (mixedCard) failed, plain text:', err.message);
    }

    // ── Tier 3: guaranteed styled fallback (still not bare plain text) ──────
    return await sock.sendMessage(m.from, {
      text: asciiBuilder.box(`👑 ${brand.name.toUpperCase()} — OWNER CARD`, [
        `Name: ${brand.creator}`,
        `Role: Developer & Bot Owner`,
        `Number: +${OWNER_NUMBER}`,
        `WhatsApp: https://wa.me/${OWNER_NUMBER}`,
      ]),
    }, { quoted: m });
  }
};
