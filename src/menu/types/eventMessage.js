import { capabilities } from '../../core/capabilities.js';
import { baileysBridge } from '../../core/baileysBridge.js';
import { buildTextMenu } from '../formatter.js';
import { imageManager } from '../../images/imageManager.js';
import { toSmallcaps } from '../../lib/smallcaps.js';
import { buildFakeImageQuote } from '../../lib/waUtils.js';

/**
 * Event Message Menu (id: 3)
 *
 * Sends the menu as a native WA event invitation card.
 *
 * CAPABILITY GATE:
 *   `capabilities.eventMessage` is now a static `true` verdict (confirmed present
 *   in WAProto.proto). The old proto-introspection check via `proto.Message.EventMessage`
 *   always returned undefined due to protobufjs nested type limitations and was
 *   incorrectly blocking this menu type.
 *
 * ROUTING NOTE:
 *   sendEvent() routes through sock.sendMessage (not relayMessage directly) so
 *   the fork's handleEvent wrapper applies the required supportPayload +
 *   messageContextInfo.messageSecret. Routing a flat eventMessage through
 *   generateWAMessageFromContent skips this wrapper and WA clients silently
 *   drop the card.
 *
 * Tiers:
 *   1 → Native eventMessage card (proto-supported — confirmed)
 *   2 → Image banner with externalAdReply
 *   3 → Guaranteed plain text
 */
export const eventMessageMenu = {
  id: 3,
  name: 'eventMessage',
  description: 'Native WA event invitation card with dynamic start time',
  supportedMessages: ['eventMessage'],

  renderer: async ({ sock, m, menuData }) => {
    const imgData   = await imageManager.getMenuImage(3);
    const eventName = `✦ ${toSmallcaps(menuData.botName)} ✦`;
    const eventDesc =
      `⚡ ${toSmallcaps('Active System Stats')}:\n` +
      `• ${toSmallcaps('Total Commands')}: ${menuData.totalCommands}\n` +
      `• ${toSmallcaps('Uptime')}: ${menuData.uptime}\n` +
      `• ${toSmallcaps('Prefix')}: ${menuData.prefix}\n` +
      `• ${toSmallcaps('Users Connected')}: ${menuData.users}`;

    // ── Tier 1: Native eventMessage card ──────────────────────────────────
    // capabilities.eventMessage is a static true (confirmed in WAProto.proto).
    // Previously gated via unreliable proto introspection — fixed to static verdict.
    if (capabilities.eventMessage) {
      try {
        return await baileysBridge.sendEvent(sock, m.from, {
          name:         eventName,
          description:  eventDesc,
          minutesAhead: 10,
          joinLink:     `https://wa.me/${menuData.ownerNumber || '233597514499'}`,
        }, { quoted: menuData.audioQuote || m });
      } catch (err) {
        console.warn('[MENU eventMessage] Tier 1 (event card) failed, trying image banner:', err.message);
      }
    }

    // ── Tier 2: Image banner with externalAdReply ──────────────────────────
    try {
      const adReply = {
        title:                 eventName,
        body:                  eventDesc.slice(0, 72),
        sourceUrl:             'https://wa.me/233533416608',
        mediaType:             1,
        renderLargerThumbnail: true,
      };
      if (imgData.buffer) {
        adReply.thumbnail = imgData.thumbnail || imgData.buffer;
        return await sock.sendMessage(m.from, {
          image:       imgData.buffer,
          mimetype:    imgData.mimetype,
          caption:     `🎉 *${eventName}*\n\n${eventDesc}\n\n` + buildTextMenu(menuData),
          contextInfo: { externalAdReply: adReply },
        }, { quoted: menuData.audioQuote || m });
      } else if (imgData.source?.startsWith('http')) {
        adReply.thumbnailUrl = imgData.source;

        adReply.originalImageUrl = imgData.source;
        return await sock.sendMessage(m.from, {
          image:       { url: imgData.source },
          caption:     `🎉 *${eventName}*\n\n${eventDesc}\n\n` + buildTextMenu(menuData),
          contextInfo: { externalAdReply: adReply },
        }, { quoted: menuData.audioQuote || m });
      }
    } catch (err) {
      console.warn('[MENU eventMessage] Tier 2 (image banner) failed, continuing to text:', err.message);
    }

    // ── Tier 3: Guaranteed plain text + fake quote + banner ────────────────
    const fakeImgQuote = buildFakeImageQuote({ jpegThumbnail: imgData.buffer || undefined });
    const fallbackAdReply = {
      title:                 `✦ ${toSmallcaps(menuData.botName)} ✦`,
      body:                  `${menuData.totalCommands} commands • Event Menu`,
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
      text:        `🎉 *${eventName}*\n\n${eventDesc}\n\n` + buildTextMenu(menuData),
      contextInfo: { externalAdReply: fallbackAdReply },
    }, { quoted: fakeImgQuote });
  },
};

export default eventMessageMenu;
