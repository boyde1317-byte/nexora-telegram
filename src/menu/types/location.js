import { baileysBridge } from '../../core/baileysBridge.js';
import { buildTextMenu } from '../formatter.js';
import { imageManager } from '../../images/imageManager.js';
import { buildFakeLiveLocationQuote } from '../../lib/waUtils.js';
import { toSmallcaps } from '../../lib/smallcaps.js';
import { buildNavigationButton, buildPillButton, buildPillUrlButton, buildPillCopyButton } from './buttonsCard.js';

/**
 * Location Menu (id: 8) — rewritten for itsliaaa 0.3.18-final fork.
 *
 * ONE message: nativeFlow interactive card (body + buttons + image header) quoted
 * inside a fake liveLocationMessage so the reply bar shows the distinctive pulsing
 * live-location card (📍 caption + animated indicator).
 *
 * Uses the fork's simple button format:
 *   { text, id }   → quick_reply
 *   { text, copy } → cta_copy
 *
 * WHY liveLocationMessage and not locationMessage:
 *   liveLocationMessage renders a standout animated card in the reply bar.
 *   Plain locationMessage shows a static 📍 pin — much less distinctive.
 *   Coordinates are proto-required but not visible; caption is what users see.
 *
 * Image strategy:
 *   imgData.buffer is passed as `image:` on the nativeFlow card (Tier 1).
 *   If the buffer download failed, the raw URL is passed as { url } so
 *   WhatsApp can fetch it directly.
 *   Tier 2 falls back to an externalAdReply text banner if nativeFlow fails.
 *   Tier 3 is guaranteed plain text.
 *
 * Tiers:
 *   1 → nativeFlow card (image header + buttons) + live location in reply bar
 *   2 → text + externalAdReply banner + live location in reply bar
 *   3 → guaranteed plain text + live location in reply bar
 */
export const locationMenu = {
  id: 8,
  name: 'location',
  description: 'nativeFlow card with image header + live location badge in the reply bar',
  supportedMessages: ['interactiveMessage', 'liveLocationMessage'],

  renderer: async ({ sock, m, menuData }) => {
    const imgData    = await imageManager.getMenuImage(8);
    const menuText   = buildTextMenu(menuData);
    const footerText = `${menuData.botName} • ${menuData.totalCommands} commands`;

    const locationQuote = buildFakeLiveLocationQuote({
      caption: `📍 ${toSmallcaps(menuData.botName || 'NEXORA-MD')} — ${toSmallcaps('Bot Command')} ✦`,
    });

    // Resolve image payload: prefer the { url } form — WA fetches it directly,
    // no local buffer download/re-upload round trip. Buffer is only a fallback
    // for local disk images that have no public URL.
    const imagePayload = imgData.source?.startsWith('http')
      ? { url: imgData.source }
      : (imgData.buffer || undefined);

    // ── Tier 1: nativeFlow card (image + buttons) + live location badge ────
    try {
      return await baileysBridge.sendButtonsCard(sock, m.from, {
        body:       menuText,
        footer:     footerText,
        title:      `✦ ${menuData.botName.toUpperCase()} ✦`,
        thumbnail:  imagePayload,
        buttons: [
          buildPillButton('📋 Command List', `${menuData.prefix}menulist`),
          buildPillCopyButton('📎 Copy Prefix', menuData.prefix),
          buildPillButton('🤖 System Stats', `${menuData.prefix}menu aiDynamic`),
          buildPillUrlButton('💬 Contact', 'https://wa.me/233533416608'),
          buildNavigationButton(menuData.prefix),
        ],
      }, { quoted: locationQuote });
    } catch (err) {
      console.warn('[MENU location] Tier 1 (nativeFlow + image + location quote) failed, trying adReply:', err.message);
    }

    // ── Tier 2: text + externalAdReply banner + live location badge ────────
    try {
      const adReply = {
        title:                 `✦ ${menuData.botName.toUpperCase()} ✦`,
        body:                  `${menuData.totalCommands} commands • Prefix: ${menuData.prefix}`,
        sourceUrl:             'https://wa.me/233533416608',
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
      }, { quoted: locationQuote });
    } catch (err) {
      console.warn('[MENU location] Tier 2 (adReply + location quote) failed, continuing to text:', err.message);
    }

    // ── Tier 3: guaranteed plain text + live location badge + banner ────────
    const fallbackAdReply = {
      title:                 `✦ ${menuData.botName.toUpperCase()} ✦`,
      body:                  `${menuData.totalCommands} commands • Prefix: ${menuData.prefix}`,
      sourceUrl:             'https://wa.me/233533416608',
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
    }, { quoted: locationQuote });
  },
};

export default locationMenu;
