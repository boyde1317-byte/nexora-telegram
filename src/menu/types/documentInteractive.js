import capabilities from '../../core/capabilities.js';
import { baileysBridge } from '../../core/baileysBridge.js';
import { buildTextMenu } from '../formatter.js';
import { imageManager } from '../../images/imageManager.js';
import { footerManager } from '../../core/footer.js';
import { toSmallcaps } from '../../lib/smallcaps.js';
import { buildFakeImageQuote } from '../../lib/waUtils.js';
import { buildNavigationButton, buildPillButton, buildPillUrlButton, buildPillCopyButton } from './buttonsCard.js';

/**
 * Document Interactive Menu (id: 1) \u2014 enhanced for rich-messages.
 *
 * Upgraded to use sendInteractive (full proto control) instead of sendNativeFlow
 * (simple declarative) for richer visual output:
 *   - Image header with title AND subtitle (not available in nativeFlow)
 *   - Embedded externalAdReply inside interactiveMessage.contextInfo
 *     (double visual: interactive card + ad banner in one message)
 *   - Full nativeFlow buttons with display_text
 *
 * Tiers:
 *   1 \u2192 sendInteractive with image header + subtitle + embedded adReply
 *   2 \u2192 nativeFlow interactive card with image header + 5 action buttons
 *   3 \u2192 image with caption + externalAdReply banner
 *   4 \u2192 guaranteed plain text
 */
export const documentInteractiveMenu = {
  id: 1,
  name: 'documentInteractive',
  description: 'Interactive card \u2014 image header + subtitle + embedded adReply + action buttons',
  supportedMessages: ['interactiveMessage', 'nativeFlowMessage'],

  renderer: async ({ sock, m, menuData }) => {
    const imgData    = await imageManager.getMenuImage(1);
    const footerText = footerManager.getFooter() || `${menuData.botName} \u2502 Uptime: ${menuData.uptime}`;
    const bodyText   = `\u2726 *${toSmallcaps(menuData.botName)}* \u2726\n\n` + buildTextMenu(menuData);

    // Resolve image payload: prefer the { url } form \u2014 WA fetches it directly,
    // no local buffer download/re-upload round trip. Buffer is only a fallback
    // for local disk images that have no public URL.
    const imagePayload = imgData.source?.startsWith('http')
      ? { url: imgData.source }
      : (imgData.buffer || undefined);

    // Build the embedded externalAdReply for double visual impact
    const adReply = {
      title:                 `\u2726 ${menuData.botName} \u2726`,
      body:                  `${menuData.totalCommands} ${toSmallcaps('commands')} \u2502 ${toSmallcaps('Interactive Card')}`,
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

    // ── Tier 1: sendInteractive with image header + subtitle + embedded adReply ──
    // Full proto control: image header with title AND subtitle, plus an
    // externalAdReply banner embedded inside the same interactive card.
    if (capabilities.interactive && imagePayload) {
      try {
        return await baileysBridge.sendButtonsCard(sock, m.from, {
          body:       bodyText,
          footer:     footerText,
          title:      `\u2726 ${toSmallcaps(menuData.botName + ' Menu')} \u2726`,
          subtitle:   `${menuData.totalCommands} ${toSmallcaps('commands')} \u2502 ${toSmallcaps('Uptime')}: ${menuData.uptime}`,
          thumbnail:  imagePayload,
          buttons: [
            buildPillButton(`\u{1F4CB} ${toSmallcaps('Switch Menu Style')}`, `${menuData.prefix}menulist`),
            buildPillButton(`\u26A1 ${toSmallcaps('System Info')}`,        `${menuData.prefix}menu aiDynamic`),
            buildPillButton(`\u{1F3D1} ${toSmallcaps('Ping Bot')}`,           `${menuData.prefix}ping`),
            buildPillUrlButton(`\u{1F4AC} ${toSmallcaps('Contact Developer')}`, 'https://wa.me/233533416608'),
            buildPillCopyButton(`\u{1F4CE} ${toSmallcaps('Copy Prefix')}`, menuData.prefix),
            buildNavigationButton(menuData.prefix),
          ],
          contextInfo: { externalAdReply: adReply },
        }, { quoted: menuData.audioQuote || m });
      } catch (err) {
        console.warn('[MENU documentInteractive] Tier 1 (sendInteractive + adReply) failed, trying nativeFlow:', err.message);
      }
    }

    // ── Tier 2: nativeFlow interactive card with image header ─────────────
    if (capabilities.nativeFlow) {
      try {
        return await baileysBridge.sendNativeFlow(sock, m.from, {
          text:    bodyText,
          footer:  footerText,
          image:   imagePayload,
          buttons: [
            { text: '\u{1F4CB} Switch Menu Style', id: `${menuData.prefix}menulist` },
            { text: '\u26A1 System Info',        id: `${menuData.prefix}menu aiDynamic` },
            { text: '\u{1F3D1} Ping Bot',           id: `${menuData.prefix}ping` },
            { text: '\u{1F4AC} Contact Developer',  url: 'https://wa.me/233533416608' },
            { text: '\u{1F4CE} Copy Prefix',        copy: menuData.prefix },
          ],
        }, { quoted: menuData.audioQuote || m });
      } catch (err) {
        console.warn('[MENU documentInteractive] Tier 2 (nativeFlow) failed, trying image banner:', err.message);
      }
    }

    // ── Tier 3: image with caption + externalAdReply ──────────────────────
    try {
      if (imgData.buffer) {
        return await sock.sendMessage(m.from, {
          image:       imgData.buffer,
          mimetype:    imgData.mimetype,
          caption:     bodyText,
          contextInfo: { externalAdReply: adReply },
        }, { quoted: menuData.audioQuote || m });
      } else if (imgData.source?.startsWith('http')) {
        return await sock.sendMessage(m.from, {
          image:       { url: imgData.source },
          caption:     bodyText,
          contextInfo: { externalAdReply: adReply },
        }, { quoted: menuData.audioQuote || m });
      }
    } catch (err) {
      console.warn('[MENU documentInteractive] Tier 3 (image banner) failed, falling back to text:', err.message);
    }

    // ── Tier 4: guaranteed plain text + fake quote + banner ───────────────
    const fakeImgQuote = buildFakeImageQuote({ jpegThumbnail: imgData.buffer || undefined });
    return await sock.sendMessage(m.from, {
      text:        bodyText,
      contextInfo: { externalAdReply: adReply },
    }, { quoted: fakeImgQuote });
  },
};

export default documentInteractiveMenu;
