import { baileysBridge } from '../../core/baileysBridge.js';
import { buildTextMenu } from '../formatter.js';
import { imageManager } from '../../images/imageManager.js';
import { buildFakeOrderQuote, buildFakeImageQuote } from '../../lib/waUtils.js';
import { toSmallcaps } from '../../lib/smallcaps.js';
import { asciiBuilder } from '../../ui/asciiBuilder.js';
import { buildNavigationButton, buildPillButton, buildPillUrlButton, buildPillCopyButton } from './buttonsCard.js';

/**
 * Order Message Menu (id: 14) — enhanced for rich-messages.
 *
 * Uses sendButtonsCard (buttonsMessage proto) as Tier 1 for universal
 * WhatsApp client compatibility. A fake orderMessage quote is used for
 * the reply bar (business order card with thumbnail + item count).
 *
 * Tiers:
 *   1 → sendButtonsCard with image header + subtitle + embedded adReply, quoted by order card
 *   2 → imageMessage with caption, quoted by order card
 *   3 → guaranteed plain text
 */
export const orderMessageMenu = {
  id: 14,
  name: 'orderMessage',
  description: 'Interactive card + image header + embedded ad-reply, quoted inside a business order card',
  supportedMessages: ['interactiveMessage', 'buttonsMessage', 'orderMessage'],

  renderer: async ({ sock, m, menuData }) => {
    const imgData = await imageManager.getMenuImage(14);

    // Build richer body text with visual stat rows
    const statBlock = [
      `\u2726 *${toSmallcaps(menuData.botName + ' Command Catalog')}* \u2726`,
      '',
      asciiBuilder.statRow('Total Commands', menuData.totalCommands),
      asciiBuilder.statRow('Prefix', menuData.prefix),
      asciiBuilder.statRow('Uptime', menuData.uptime),
      '',
    ].join('\n');

    const bodyText = statBlock + buildTextMenu(menuData);
    const footerText = `${menuData.botName} \u2502 ${menuData.totalCommands} ${toSmallcaps('commands')}`;

    // ── Resolve image payload once ─────────────────────────────────────────
    const imagePayload = imgData.source?.startsWith('http')
      ? { url: imgData.source }
      : (imgData.buffer || undefined);

    // ── Build order-quote thumbnail ────────────────────────────────────────
    // Use the small mock thumbnail for the quoted message (not the full-size
    // buffer) to avoid inflating the quoted message proto. The full image is
    // uploaded separately by sendButtonsCard for the card header.
    let orderQuote;
    try {
      orderQuote = buildFakeOrderQuote({
        orderId:    'NEXORA-CMD-PACK',
        itemCount:  menuData.totalCommands,
        thumbnail:  imgData.thumbnail || undefined,
        title:      menuData.botName,
      });
    } catch (_) {
      orderQuote = menuData.audioQuote || m;
    }

    // Build embedded externalAdReply
    const adReply = {
      title:                 `\u2726 ${menuData.botName} \u2726`,
      body:                  `${menuData.totalCommands} ${toSmallcaps('commands')} \u2502 ${toSmallcaps('Order Card')}`,
      sourceUrl:             'https://wa.me/233533416608',
      mediaType:             1,
      renderLargerThumbnail: true,
      showAdAttribution:     false,
    };
    if (imgData.buffer) {
      adReply.thumbnail = imgData.buffer;
    } else if (imgData.source?.startsWith('http')) {
      adReply.thumbnailUrl = imgData.source;
      adReply.originalImageUrl = imgData.source;
    }

    // ── Tier 1: sendButtonsCard with image header + subtitle + embedded adReply ──
    if (imagePayload) {
      try {
        return await baileysBridge.sendButtonsCard(sock, m.from, {
          body:       bodyText,
          footer:     footerText,
          title:      `\u2726 ${toSmallcaps('Command Catalog')} \u2726`,
          subtitle:   `${menuData.totalCommands} ${toSmallcaps('commands')} \u2502 ${toSmallcaps('Prefix')}: ${menuData.prefix}`,
          thumbnail:  imagePayload,
          buttons: [
            buildPillUrlButton('\u{1F4AC} Contact Developer', 'https://wa.me/233533416608'),
            buildPillUrlButton('\u{1F4E1} Official Channel', 'https://whatsapp.com/channel/0029Vb7eSHf42Dcmdd3XA326'),
            buildPillCopyButton('\u{1F4CE} Copy Prefix', menuData.prefix),
            buildPillButton('\u{1F3A8} Browse Menu Styles', `${menuData.prefix}menulist`),
            buildPillButton('\u{1F916} System Stats',       `${menuData.prefix}menu aiDynamic`),
            buildNavigationButton(menuData.prefix),
          ],
          contextInfo: { externalAdReply: adReply },
        }, { quoted: menuData.audioQuote || m });
      } catch (err) {
        console.warn('[MENU orderMessage] Tier 1 (sendButtonsCard + adReply + order) failed, trying image:', err.message);
      }
    }

    // ── Tier 2: imageMessage with caption ─────────────────────────────────
    try {
      if (imgData.buffer) {
        return await sock.sendMessage(m.from, {
          image:       imgData.buffer,
          mimetype:    imgData.mimetype,
          caption:      bodyText,
          contextInfo: { externalAdReply: adReply },
        }, { quoted: menuData.audioQuote || m });
      } else if (imgData.source?.startsWith('http')) {
        return await sock.sendMessage(m.from, {
          image:       { url: imgData.source },
          caption:      bodyText,
          contextInfo: { externalAdReply: adReply },
        }, { quoted: menuData.audioQuote || m });
      }
    } catch (err) {
      console.warn('[MENU orderMessage] Tier 2 (image + order quote) failed, continuing to text:', err.message);
    }

    // ── Tier 3: guaranteed plain text + fake quote + banner ───────────────
    const fakeImgQuote = buildFakeImageQuote({ jpegThumbnail: imgData.buffer || undefined });
    return await sock.sendMessage(m.from, {
      text:        bodyText,
      contextInfo: { externalAdReply: adReply },
    }, { quoted: fakeImgQuote });
  },
};

export default orderMessageMenu;
