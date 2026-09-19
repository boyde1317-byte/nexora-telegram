import { capabilities } from '../../core/capabilities.js';
import { baileysBridge } from '../../core/baileysBridge.js';
import { buildTextMenu } from '../formatter.js';
import { imageManager } from '../../images/imageManager.js';
import { footerManager } from '../../core/footer.js';
import { toSmallcaps } from '../../lib/smallcaps.js';
import { asciiBuilder } from '../../ui/asciiBuilder.js';

/**
 * Bottom Sheet Menu (id: 13) \u2014 enhanced for rich-messages.
 *
 * Enhanced with:
 *   - Richer body text using stat rows and visual dividers
 *   - More command buttons in the sheet (up to 10)
 *   - Better visual organization with emoji-prefixed commands
 *   - Image header with subtitle via sendInteractive fallback
 *   - Embedded externalAdReply for double visual on fallback tiers
 *
 * Tiers:
 *   1 \u2192 nativeFlow with optionText + image header (triggers native WA bottom sheet)
 *   2 \u2192 sendInteractive with image header + subtitle + embedded adReply
 *   3 \u2192 nativeFlow without optionText + image header (flat quick-reply buttons)
 *   4 \u2192 guaranteed plain text
 */
export const bottomSheetMenu = {
  id: 13,
  name: 'bottomSheet',
  description: 'Bottom sheet modal \u2014 optionText on nativeFlow collapses rows into a native WA sheet with rich visuals',
  supportedMessages: ['interactiveMessage', 'nativeFlowMessage'],

  renderer: async ({ sock, m, menuData }) => {
    const imgData    = await imageManager.getMenuImage(13);

    // Build richer body text with visual stat rows
    const statBlock = [
      `\u2726 *${toSmallcaps(menuData.botName + ' Command Center')}* \u2726`,
      '',
      asciiBuilder.statRow('Total Commands', menuData.totalCommands),
      asciiBuilder.statRow('Prefix', menuData.prefix),
      asciiBuilder.statRow('Uptime', menuData.uptime),
      asciiBuilder.statRow('Users', menuData.users),
      '',
      asciiBuilder.divider(toSmallcaps('Commands')),
      '',
    ].join('\n');

    const bodyText   = statBlock + buildTextMenu(menuData);
    const footerText = footerManager.getFooter() || `${menuData.botName} \u2502 ${toSmallcaps('Bottom Sheet')}`;

    // Resolve image payload
    const imagePayload = imgData.source?.startsWith('http')
      ? { url: imgData.source }
      : (imgData.buffer || undefined);

    // Build embedded externalAdReply for fallback tiers
    const adReply = {
      title:                 `\u2726 ${menuData.botName} \u2726`,
      body:                  `${menuData.totalCommands} ${toSmallcaps('commands')} \u2502 ${toSmallcaps('Bottom Sheet')}`,
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

    // Command rows exposed in the sheet \u2014 richer set with emoji prefixes
    const commandButtons = [
      { text: '\u{1F3D1} Ping Speed',          id: `${menuData.prefix}ping` },
      { text: '\u{2139}\uFE0F About Bot',           id: `${menuData.prefix}about` },
      { text: '\u{1F4CB} Command List',          id: `${menuData.prefix}menulist` },
      { text: '\u{1F916} System Stats',          id: `${menuData.prefix}menu aiDynamic` },
      { text: '\u{1F3A8} Set Menu Style',         id: `${menuData.prefix}setmenu` },
      { text: '\u{1F3ED} Set Footer',            id: `${menuData.prefix}setfooter` },
      { text: '\u{1F4AC} Contact Dev',           url: 'https://wa.me/233533416608' },
    ];

    // ── Tier 1: nativeFlow + optionText + image header ────────────────────
    if (capabilities.nativeFlow) {
      try {
        return await baileysBridge.sendNativeFlow(sock, m.from, {
          text:        bodyText,
          footer:      footerText,
          image:       imagePayload,
          buttons:     commandButtons,
          optionText:  '\u{1F4CB} ' + toSmallcaps('Browse All Commands'),
          optionTitle: menuData.botName + ' Menu',
        }, { quoted: menuData.audioQuote || m });
      } catch (err) {
        console.warn('[MENU bottomSheet] Tier 1 (nativeFlow + optionText + image) failed, trying interactive:', err.message);
      }
    }

    // ── Tier 2: sendInteractive with image header + subtitle + embedded adReply ──
    if (capabilities.interactive && imagePayload) {
      try {
        return await baileysBridge.sendInteractive(sock, m.from, {
          body:    bodyText,
          footer:  footerText,
          header:  {
            title:    `\u2726 ${toSmallcaps(menuData.botName + ' Menu')} \u2726`,
            subtitle: `${toSmallcaps('Quick Access')} \u2502 ${menuData.totalCommands} ${toSmallcaps('commands')}`,
            image:    imagePayload,
          },
          buttons: [
            { name: 'quick_reply', params: { display_text: '\u{1F3D1} Ping Speed',       id: `${menuData.prefix}ping` } },
            { name: 'quick_reply', params: { display_text: '\u{1F4CB} Command List',     id: `${menuData.prefix}menulist` } },
            { name: 'quick_reply', params: { display_text: '\u{1F916} System Stats',     id: `${menuData.prefix}menu aiDynamic` } },
            { name: 'cta_url',     params: { display_text: '\u{1F4AC} Contact Dev',      url: 'https://wa.me/233533416608' } },
          ],
          contextInfo: { externalAdReply: adReply, ...(menuData.channelPill || {}) },
        }, { quoted: menuData.audioQuote || m });
      } catch (err) {
        console.warn('[MENU bottomSheet] Tier 2 (sendInteractive + adReply) failed, trying flat nativeFlow:', err.message);
      }
    }

    // ── Tier 3: nativeFlow without optionText + image header ──────────────
    if (capabilities.nativeFlow) {
      try {
        return await baileysBridge.sendNativeFlow(sock, m.from, {
          text:    bodyText,
          footer:  footerText,
          image:   imagePayload,
          buttons: commandButtons.slice(0, 5),
        }, { quoted: menuData.audioQuote || m });
      } catch (err) {
        console.warn('[MENU bottomSheet] Tier 3 (flat nativeFlow + image) failed, escalating to text:', err.message);
        throw err; // propagate → runWithFallback → plain text
      }
    }

    // ── Tier 4: nativeFlow unsupported — let runWithFallback render plain text
    throw new Error('bottomSheet: nativeFlow unsupported on this client');
  },
};

export default bottomSheetMenu;
