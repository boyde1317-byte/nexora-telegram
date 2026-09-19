import { baileysBridge } from '../../core/baileysBridge.js';
import { buildTextMenu } from '../formatter.js';
import { imageManager } from '../../images/imageManager.js';
import { buildFakeContactQuote } from '../../lib/waUtils.js';
import { config } from '../../../config/index.js';
import brand from '../../../config/brand.js';
import { buildNavigationButton, buildPillButton, buildPillUrlButton, buildPillCopyButton } from './buttonsCard.js';

/**
 * Contact Menu (id: 9) — rewritten for itsliaaa 0.3.18-final fork.
 *
 * ONE message: nativeFlow interactive card (image header + body + buttons) quoted
 * inside a fake contactMessage so the reply bar shows a tappable vCard for the owner.
 *
 * Uses the fork's simple button format:
 *   { text, url }   → cta_url
 *   { text, id }    → quick_reply
 *   { text, copy }  → cta_copy
 *
 * The contact quote uses buildFakeContactQuote — Moonson-proven key shape
 * (0@s.whatsapp.net participant + status@broadcast remoteJid), AI attribution
 * carried in the vcard's waid. WA never looks up the original message in
 * chat history — no ghost thread.
 *
 * Image strategy:
 *   imgData.buffer is passed as `image:` on the Tier 1 nativeFlow card.
 *   If the buffer download failed, the raw URL is passed as { url }.
 *   Tier 2 falls back to an externalAdReply banner on a plain text message.
 *   Tier 3 is bare text with the contact badge.
 *
 * Tiers:
 *   1 → nativeFlow card (image + buttons) + owner contact card in reply bar
 *   2 → text + externalAdReply banner + owner contact card in reply bar
 *   3 → guaranteed plain text + owner contact card in reply bar
 */
export const contactMenu = {
  id: 9,
  name: 'contact',
  description: 'nativeFlow card with image header + owner vCard contact badge in the reply bar',
  supportedMessages: ['interactiveMessage', 'nativeFlowMessage'],

  renderer: async ({ sock, m, menuData }) => {
    const imgData      = await imageManager.getMenuImage(9);
    const ownerNumber  = (config.owner[0] || '233597514499').replace(/[^0-9]/g, '');
    const ownerName    = menuData.ownerName || brand.creator || 'Owner';

    const menuText   = buildTextMenu(menuData);
    const footerText = `${menuData.botName} • ${menuData.totalCommands} commands`;

    // Contact card in the reply bar — tappable vCard showing the owner's name.
    const contactQuote = buildFakeContactQuote({
      displayName: ownerName,
      phoneNumber: ownerNumber,
    });

    // Resolve image payload: prefer the { url } form — WA fetches it directly,
    // no local buffer download/re-upload round trip. Buffer is only a fallback
    // for local disk images that have no public URL.
    const imagePayload = imgData.source?.startsWith('http')
      ? { url: imgData.source }
      : (imgData.buffer || undefined);

    // ── Tier 1: nativeFlow card (image + buttons) + contact badge ──────────
    try {
      return await baileysBridge.sendButtonsCard(sock, m.from, {
        body:       menuText,
        footer:     footerText,
        title:      `✦ ${menuData.botName.toUpperCase()} ✦`,
        thumbnail:  imagePayload,
        buttons: [
          buildPillUrlButton(`💬 Message ${ownerName}`, `https://wa.me/${ownerNumber}`),
          buildPillButton('📋 Command List', `${menuData.prefix}menulist`),
          buildPillCopyButton('📎 Copy Prefix', menuData.prefix),
          buildPillButton('🤖 System Stats', `${menuData.prefix}menu aiDynamic`),
          buildNavigationButton(menuData.prefix),
        ],
      }, { quoted: contactQuote });
    } catch (err) {
      console.warn('[MENU contact] Tier 1 (nativeFlow + image + contact quote) failed, trying adReply:', err.message);
    }

    // ── Tier 2: text + externalAdReply banner + contact badge ─────────────
    try {
      const adReply = {
        title:                 `✦ ${menuData.botName.toUpperCase()} ✦`,
        body:                  `${menuData.totalCommands} commands • Prefix: ${menuData.prefix}`,
        sourceUrl:             `https://wa.me/${ownerNumber}`,
        mediaType:             1,
        renderLargerThumbnail: true,
      };
      if (imgData.buffer) {
        adReply.thumbnail = imgData.buffer;
      } else if (imgData.source?.startsWith('http')) {
        adReply.thumbnailUrl = imgData.source;

        adReply.originalImageUrl = imgData.source;
      }
      return await sock.sendMessage(m.from, {
        text:        menuText,
        contextInfo: { externalAdReply: adReply },
      }, { quoted: contactQuote });
    } catch (err) {
      console.warn('[MENU contact] Tier 2 (adReply + contact quote) failed, continuing to text:', err.message);
    }

    // ── Tier 3: guaranteed plain text + contact badge + banner ────────────
    const fallbackAdReply = {
      title:                 `✦ ${menuData.botName.toUpperCase()} ✦`,
      body:                  `${menuData.totalCommands} commands • Prefix: ${menuData.prefix}`,
      sourceUrl:             `https://wa.me/${ownerNumber}`,
      mediaType:             1,
      renderLargerThumbnail: true,
      showAdAttribution:     false,
    };
    if (imgData.buffer) {
      fallbackAdReply.thumbnail = imgData.buffer;
    } else if (imgData.source?.startsWith('http')) {
      fallbackAdReply.thumbnailUrl = imgData.source;
      fallbackAdReply.originalImageUrl = imgData.source;
    }
    return await sock.sendMessage(m.from, {
      text:        menuText,
      contextInfo: { externalAdReply: fallbackAdReply },
    }, { quoted: contactQuote });
  },
};

export default contactMenu;
