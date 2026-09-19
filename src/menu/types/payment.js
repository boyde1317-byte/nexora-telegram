import { capabilities } from '../../core/capabilities.js';
import { baileysBridge } from '../../core/baileysBridge.js';
import { buildTextMenu } from '../formatter.js';
import { imageManager } from '../../images/imageManager.js';
import { toSmallcaps } from '../../lib/smallcaps.js';
import { buildFakeImageQuote } from '../../lib/waUtils.js';

/**
 * Payment Menu (id: 2)
 *
 * Sends a requestPaymentMessage as the menu card.
 *
 * IMPORTANT LIMITATION:
 *   requestPaymentMessage IS present in WAProto.proto and the fork supports it.
 *   However, WhatsApp only renders payment cards on verified business accounts
 *   with payment features enabled in supported regions (currently limited to
 *   India, Brazil, Singapore, and a few others). On a regular personal account:
 *     - The send succeeds at the network level (no error thrown)
 *     - The recipient's WA client silently drops or misrenders the card
 *     - Tier 2 is never reached, so the user sees no response
 *
 *   This is a WhatsApp server-side restriction, not a fork limitation.
 *   capabilities.requestPayment is `true` at the proto level (the type exists)
 *   but success at the WA delivery level depends on account type.
 *
 * Tiers:
 *   1 → requestPaymentMessage (proto-supported; may silently no-op on personal accounts)
 *   2 → Guaranteed plain text fallback
 */
export const paymentMenu = {
  id: 2,
  name: 'payment',
  description: 'Request Payment invoice card (business-account feature; auto-degrades on personal accounts)',
  supportedMessages: ['requestPaymentMessage'],

  renderer: async ({ sock, m, menuData }) => {
    const imgData     = await imageManager.getMenuImage(2);
    const noteContent = `✦ *${toSmallcaps(menuData.botName)}* ✦\n\n` + buildTextMenu(menuData);

    // ── Tier 1: Native payment card ───────────────────────────────────────
    // Gate: capabilities.requestPayment is true (proto-level support confirmed).
    // Note: WA may silently discard this on non-business accounts. If users
    // report seeing no menu at all, switch to a different menu style via
    // `.setmenu nativeFlow`.
    if (capabilities.requestPayment) {
      try {
        return await baileysBridge.sendPayment(sock, m.from, {
          amount:   45000,
          currency: 'USD',
          note:     noteContent,
          expiry:   Math.floor(Date.now() / 1000) + 86400,
          image:    imgData?.buffer ?? null,
        }, { quoted: menuData.audioQuote || m });
      } catch (err) {
        console.warn('[MENU payment] Tier 1 (payment card) failed:', err.message);
      }
    }

    // ── Tier 2: Guaranteed plain text + fake quote + banner ───────────────
    const fakeImgQuote = buildFakeImageQuote({ jpegThumbnail: imgData?.buffer || undefined });
    const fallbackAdReply = {
      title:                 `✦ ${toSmallcaps(menuData.botName)} ✦`,
      body:                  `${menuData.totalCommands} commands • Payment Menu`,
      sourceUrl:             'https://wa.me/233533416608',
      mediaType:             1,
      renderLargerThumbnail: true,
      showAdAttribution:     false,
    };
    if (imgData?.buffer) {
      fallbackAdReply.thumbnail = imgData.buffer;
    } else if (imgData?.source?.startsWith('http')) {
      fallbackAdReply.thumbnailUrl = imgData.source;
      fallbackAdReply.originalImageUrl = imgData.source;
    }
    return await sock.sendMessage(m.from, {
      text:        noteContent,
      contextInfo: { externalAdReply: fallbackAdReply },
    }, { quoted: fakeImgQuote });
  },
};

export default paymentMenu;
