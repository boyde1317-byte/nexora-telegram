import { buildTextMenu } from '../formatter.js';
import { imageManager } from '../../images/imageManager.js';
import { capabilities } from '../../core/capabilities.js';
import { baileysBridge } from '../../core/baileysBridge.js';
import { toSmallcaps } from '../../lib/smallcaps.js';
import { asciiBuilder } from '../../ui/asciiBuilder.js';
import { buildFakeImageQuote } from '../../lib/waUtils.js';
import { buildNavigationButton, buildPillButton, buildPillUrlButton, buildPillCopyButton } from './buttonsCard.js';

/**
 * Media Menu (id: 10) \u2014 enhanced for rich-messages.
 *
 * Upgraded to use sendInteractive with image header + subtitle + embedded
 * externalAdReply for a double-visual: interactive card AND ad banner.
 * Richer body text with stat rows and visual dividers.
 *
 * Tiers:
 *   1 \u2192 sendInteractive with image header + subtitle + embedded adReply
 *   2 \u2192 nativeFlow interactive card with image header + buttons
 *   3 \u2192 text + externalAdReply banner
 */
export const mediaMenu = {
  id: 10,
  name: 'media',
  description: 'Rich Media Showcase \u2014 interactive card with embedded ad-reply, stat dashboard, and action buttons',
  supportedMessages: ['interactiveMessage', 'nativeFlowMessage', 'imageMessage', 'extendedTextMessage'],

  renderer: async ({ sock, m, menuData }) => {
    const imgData = await imageManager.getMenuImage(10);

    const imagePayload = imgData.source?.startsWith('http')
      ? { url: imgData.source }
      : (imgData.buffer || undefined);

    const footerText = `${menuData.botName} \u2502 ${menuData.totalCommands} commands`;

    // Build richer body text with visual stat rows
    const headerBlock = [
      `\u2726 *${toSmallcaps('Media Showcase Dashboard')}* \u2726`,
      '',
      asciiBuilder.statRow('Uptime', menuData.uptime),
      asciiBuilder.statRow('Plugins', menuData.totalCommands),
      asciiBuilder.statRow('Users', menuData.users),
      asciiBuilder.statRow('Prefix', menuData.prefix),
      '',
      asciiBuilder.divider(toSmallcaps('Command Grid')),
      '',
    ].join('\n');

    const caption = headerBlock + buildTextMenu(menuData);

    // Build embedded externalAdReply
    const adReply = {
      title:                 `${menuData.botName} ${toSmallcaps('Media Core')}`,
      body:                  `${toSmallcaps('Uptime')}: ${menuData.uptime} \u2502 ${toSmallcaps('Plugins')}: ${menuData.totalCommands}`,
      sourceUrl:             `https://wa.me/${menuData.ownerNumber || '233597514499'}`,
      mediaType:             1,
      renderLargerThumbnail: true,
      showAdAttribution:     true,
    };
    if (imgData.buffer) {
      adReply.thumbnail = imgData.buffer;
    } else if (imgData.source?.startsWith('http')) {
      adReply.thumbnailUrl = imgData.source;
      adReply.originalImageUrl = imgData.source;
    }

    // ── Tier 1: sendInteractive with image header + subtitle + embedded adReply ──
    if (capabilities.interactive && imagePayload) {
      try {
        return await baileysBridge.sendButtonsCard(sock, m.from, {
          body:       caption,
          footer:     footerText,
          title:      `\u2726 ${toSmallcaps('Media Showcase')} \u2726`,
          subtitle:   `${menuData.totalCommands} ${toSmallcaps('commands')} \u2502 ${toSmallcaps('Uptime')}: ${menuData.uptime}`,
          thumbnail:  imagePayload,
          buttons: [
            buildPillButton(`\u{1F4CB} ${toSmallcaps('Browse Menu Styles')}`, `${menuData.prefix}menulist`),
            buildPillButton(`\u{1F3D1} ${toSmallcaps('Ping Bot')}`,           `${menuData.prefix}ping`),
            buildPillUrlButton(`\u{1F4AC} ${toSmallcaps('Contact Developer')}`, 'https://wa.me/233533416608'),
            buildNavigationButton(menuData.prefix),
          ],
          contextInfo: { externalAdReply: adReply },
        }, { quoted: menuData.audioQuote || m });
      } catch (err) {
        console.warn('[MENU media] Tier 1 (sendInteractive + adReply) failed, trying nativeFlow:', err.message);
      }
    }

    // ── Tier 2: nativeFlow interactive card with buttons ───────────────────
    if (capabilities.nativeFlow) {
      try {
        return await baileysBridge.sendNativeFlow(sock, m.from, {
          text:    caption,
          footer:  footerText,
          image:   imagePayload,
          buttons: [
            { text: `\u{1F4CB} ${toSmallcaps('Browse Menu Styles')}`, id: `${menuData.prefix}menulist` },
            { text: `\u{1F3D1} ${toSmallcaps('Ping Bot')}`,           id: `${menuData.prefix}ping` },
            { text: `\u{1F4AC} ${toSmallcaps('Contact Developer')}`,   url: 'https://wa.me/233533416608' },
          ],
        }, { quoted: menuData.audioQuote || m });
      } catch (err) {
        console.warn('[MENU media] Tier 2 (nativeFlow) failed, trying adReply:', err.message);
      }
    }

    // ── Tier 3: text + externalAdReply banner ───────────────────────────────
    return await sock.sendMessage(m.from, {
      text: caption,
      contextInfo: { externalAdReply: adReply },
    }, { quoted: buildFakeImageQuote({ jpegThumbnail: imgData.buffer || undefined }) });
  },
};

export default mediaMenu;
