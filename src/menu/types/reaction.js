import { buildCompactMenu } from '../formatter.js';
import { toSmallcaps } from '../../lib/smallcaps.js';
import { imageManager } from '../../images/imageManager.js';
import { buildFakeImageQuote } from '../../lib/waUtils.js';

export const reactionMenu = {
  id: 11,
  name: 'reaction',
  description: 'Ultra-lightweight reaction-triggered and live-edited inline menu',
  supportedMessages: ['react', 'edit'],

  renderer: async ({ sock, m, menuData }) => {
    // Pre-fetch image for externalAdReply banner on the final message.
    // We do this early so the await doesn't delay the loading indicator.
    const imgData = await imageManager.getMenuImage(11);

    // Build the externalAdReply card once — reused across Tier 1 edit fallback
    // and Tier 2 fresh send. The edit message type does not support contextInfo,
    // so we attach it only to fresh sends (Tier 2) and the initial loading stub.
    const adReply = {
      title:                 `✦ ${toSmallcaps(menuData.botName)} ✦`,
      body:                  `${menuData.totalCommands} commands • Prefix: ${menuData.prefix}`,
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

    const hasImage = !!(imgData.buffer || imgData.source?.startsWith('http'));

    // 1. React with a loading emoji (non-critical — ignore failure)
    try { await m.react('⏳'); } catch (_) {}

    // 2. Send the loading placeholder — include the image banner here so that
    //    even if live-edit rewrites the text later, the user already saw the image.
    const loadingMsg = await sock.sendMessage(m.from, {
      text: `✦ *${toSmallcaps(menuData.botName)}* ✦\n\n⏳ _${toSmallcaps('Synchronizing plugins and command directories')}..._`,
      ...(hasImage ? { contextInfo: { externalAdReply: adReply } } : {}),
    }, { quoted: menuData.audioQuote || m });

    // 3. Brief pause for UX
    await new Promise(resolve => setTimeout(resolve, 1200));

    // 4. Update reaction to complete (non-critical)
    try { await m.react('✅'); } catch (_) {}

    // 5. Build the final menu text
    const finalMenuText = buildCompactMenu(menuData);

    // ── Tier 1: Live-edit the loading message ─────────────────────────────
    // NOTE: `edit` messages do not carry contextInfo — the image banner already
    // appeared on the original loading message above, so the UX is consistent.
    if (loadingMsg?.key) {
      try {
        return await sock.sendMessage(m.from, {
          text: finalMenuText,
          edit: loadingMsg.key,
        });
      } catch (editErr) {
        console.warn('[MENU reaction] Tier 1 (live-edit) failed on this client, sending new message:', editErr.message);
        // Attempt to delete the stale loading message so it doesn't confuse the user
        try {
          await sock.sendMessage(m.from, { delete: loadingMsg.key });
        } catch (_) {}
      }
    }

    // ── Tier 2: Send as a fresh message (edit unsupported) ────────────────
    // Attach the image banner so the fresh fallback also renders the image card.
    return await sock.sendMessage(m.from, {
      text: finalMenuText,
      ...(hasImage ? { contextInfo: { externalAdReply: adReply } } : {}),
    }, { quoted: buildFakeImageQuote({ jpegThumbnail: imgData.buffer || undefined }) });
  }
};

export default reactionMenu;
