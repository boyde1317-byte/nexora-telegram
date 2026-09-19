import { baileysBridge } from '../../core/baileysBridge.js';
import { buildTextMenu } from '../formatter.js';
import { imageManager } from '../../images/imageManager.js';
import { toSmallcaps } from '../../lib/smallcaps.js';
import { buildFakeImageQuote } from '../../lib/waUtils.js';

// Maximum carousel cards sent in a single batch.
const MAX_CAROUSEL_CARDS = 10;

// Category-specific emoji mapping for richer card headers
const CATEGORY_EMOJIS = {
  ai: '\u{1F916}', anime: '\u{1F3A8}', download: '\u{1F4E5}', economy: '\u{1FA9}',
  fun: '\u{1F3B6}', games: '\u{1F3AE}', general: '\u{1F4CB}', group: '\u{1F465}',
  media: '\u{1F3AC}', owner: '\u{1F511}', utility: '\u{1F527}', web: '\u{1F310}',
};

/**
 * Carousel Menu (id: 6) \u2014 enhanced for rich-messages.
 *
 * Enhanced card content with:
 *   - Category-specific emoji icons per card header
 *   - Richer caption with command count and top commands preview
 *   - Multiple action buttons per card (category browse + system stats)
 *   - Better footer with card numbering and total commands
 *   - Visual separators and smallcaps labels
 *
 * Tiers:
 *   1 \u2192 native carousel (swipeable category cards \u2014 capped at MAX_CAROUSEL_CARDS)
 *   2 \u2192 nativeFlow category picker (flat buttons, one per category, up to 10)
 *   3 \u2192 guaranteed plain text
 */
export const carouselMenu = {
  id: 6,
  name: 'carousel',
  description: 'Swipeable category cards \u2014 rich per-card headers with emoji icons, command previews, and action buttons',
  supportedMessages: ['interactiveMessage', 'carouselMessage'],

  renderer: async ({ sock, m, menuData }) => {
    const imgData = await imageManager.getMenuImage(6);

    const headerText =
      `\u{1F3A0} *${toSmallcaps(menuData.botName + ' Carousel Control')}* \u{1F3A0}\n\n` +
      `${toSmallcaps('Swipe sideways through the cards below to browse command modules:')}\n` +
      `${toSmallcaps('Each card shows top commands \u2014 tap to explore more.')}`;

    const categories = Object.keys(menuData.categories).sort();

    // ── Tier 1: native carousel ───────────────────────────────────────────
    try {
      const capped = categories.slice(0, MAX_CAROUSEL_CARDS);

      if (categories.length > MAX_CAROUSEL_CARDS) {
        console.warn(
          `[MENU carousel] ${categories.length} categories found \u2014 capped at ${MAX_CAROUSEL_CARDS} cards. ` +
          `Remaining ${categories.length - MAX_CAROUSEL_CARDS} categories omitted to prevent rate-limit bans.`
        );
      }

      const cards = capped.map((cat, idx) => {
        const cmds     = menuData.categories[cat];
        const emoji    = CATEGORY_EMOJIS[cat] || '\u{1F4C2}';
        const cmdList  = cmds.map(c => `\u2022 \`${menuData.prefix}${c.name}\``).slice(0, 5).join('\n');
        const overflow = cmds.length > 5 ? `\n  \u2502 +${cmds.length - 5} ${toSmallcaps('more')}` : '';

        return {
          caption:   `${emoji} *${toSmallcaps(cat + ' Command Pack')}*\n\n${cmdList}${overflow}\n\n${toSmallcaps('Total')}: ${cmds.length} ${toSmallcaps('commands')}`,
          footer:    `\u2726 ${toSmallcaps('Card')} ${idx + 1}/${capped.length} \u2502 ${menuData.botName}`,
          nativeFlow: [
            { text: `\u26A1 ${cat.toUpperCase()}`, id: `${menuData.prefix}menu` },
            { text: `\u{1F916} ${toSmallcaps('Stats')}`, id: `${menuData.prefix}menu aiDynamic` },
          ],
          ...(imgData.source?.startsWith('http')
            ? { image: { url: imgData.source } }
            : (imgData.buffer ? { image: imgData.buffer } : {})),
        };
      });

      return await baileysBridge.sendCarousel(sock, m.from, {
        text:  headerText,
        cards,
      }, { quoted: menuData.audioQuote || m });
    } catch (err) {
      console.warn('[MENU carousel] Tier 1 (carousel) failed, trying nativeFlow category buttons:', err.message);
    }

    // ── Tier 2: nativeFlow category picker ───────────────────────────────
    try {
      const catButtons = categories.slice(0, 10).map(cat => {
        const emoji = CATEGORY_EMOJIS[cat] || '\u{1F4C2}';
        return {
          text: `${emoji} ${cat.toUpperCase()} (${menuData.categories[cat].length})`,
          id:   `${menuData.prefix}menu`,
        };
      });
      if (catButtons.length === 0) {
        catButtons.push({ text: '\u{1F4CB} View Menu', id: `${menuData.prefix}menu` });
      }
      return await baileysBridge.sendNativeFlow(sock, m.from, {
        text:    `${headerText}\n\n` + buildTextMenu(menuData),
        footer:  `${menuData.botName} \u2502 ${menuData.totalCommands} ${toSmallcaps('commands')}`,
        title:   '\u{1F3A0} ' + toSmallcaps('COMMAND CATEGORIES'),
        buttons: catButtons,
      }, { quoted: menuData.audioQuote || m });
    } catch (err) {
      console.warn('[MENU carousel] Tier 2 (nativeFlow) failed, continuing to plain text:', err.message);
    }

    // ── Tier 3: guaranteed plain text + fake quote + banner ────────────────
    const fakeImgQuote = buildFakeImageQuote({ jpegThumbnail: imgData.buffer || undefined });
    const fallbackAdReply = {
      title:                 `✦ ${toSmallcaps(menuData.botName)} ✦`,
      body:                  `${menuData.totalCommands} commands • Carousel`,
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
      text:        `${headerText}\n\n` + buildTextMenu(menuData),
      contextInfo: { externalAdReply: fallbackAdReply },
    }, { quoted: fakeImgQuote });
  },
};

export default carouselMenu;
