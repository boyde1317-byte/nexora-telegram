import capabilities from '../../core/capabilities.js';
import { baileysBridge } from '../../core/baileysBridge.js';
import { buildTextMenu } from '../formatter.js';
import { imageManager } from '../../images/imageManager.js';
import { toSmallcaps } from '../../lib/smallcaps.js';
import { asciiBuilder } from '../../ui/asciiBuilder.js';
import { buildFakeImageQuote, buildAboutContextInfo, resolveThumbnail } from '../../lib/waUtils.js';
import { buildNavigationButton } from './buttonsCard.js';
import { ASSET_URLS } from '../../assets/assetUrls.js';

/**
 * Rich Card Menu (id: 15) — .about-style rendering.
 *
 * Primary tier uses sendButtonsCard (thumbnail header + product catalog quote
 * + pill buttons), matching the .about command's visual style.
 * The native richResponse table is retained as Tier 2.
 *
 * Tiers:
 *   1 → sendButtonsCard (.about style: thumbnail header + catalog quote + pill buttons)
 *   2 → sendRichResponse (native WA table bubble)
 *   3 → sendInteractive with image header + embedded externalAdReply
 *   4 → text + externalAdReply banner
 *   5 → guaranteed plain text
 */
export const richCardMenu = {
  id: 15,
  name: 'richCard',
  description: 'About-style buttons card with thumbnail header + catalog quote + table fallback',
  supportedMessages: ['buttonsMessage', 'richResponseMessage', 'interactiveMessage', 'nativeFlowMessage', 'extendedTextMessage'],

  renderer: async ({ sock, m, menuData }) => {
    const imgData = await imageManager.getMenuImage(15);
    const footerText = `${menuData.botName} \u2726 ${menuData.totalCommands} ${toSmallcaps('commands')} \u2726 ${menuData.uptime}`;

    const categories = Object.keys(menuData.categories).sort();
    const tableRows = categories.map(cat => {
      const cmds = menuData.categories[cat];
      const top3 = cmds.slice(0, 3).map(c => c.name).join(', ');
      const overflow = cmds.length > 3 ? ` +${cmds.length - 3}` : '';
      return [cat, top3 + overflow, String(cmds.length)];
    });

    // Build visual text body
    const bodyLines = [];
    bodyLines.push(asciiBuilder.statRow('Total Commands', menuData.totalCommands));
    bodyLines.push(asciiBuilder.statRow('Categories', categories.length));
    bodyLines.push(asciiBuilder.statRow('Prefix', menuData.prefix));
    bodyLines.push(asciiBuilder.statRow('Uptime', menuData.uptime));
    bodyLines.push('');
    bodyLines.push(asciiBuilder.divider(toSmallcaps('Command Grid')));
    bodyLines.push('');

    for (const cat of categories) {
      const cmds = menuData.categories[cat];
      const top = cmds.slice(0, 4).map(c => c.name).join(' \u2502 ');
      const overflow = cmds.length > 4 ? ` \u2502 +${cmds.length - 4} ${toSmallcaps('more')}` : '';
      bodyLines.push(`\u2726 *${toSmallcaps(cat)}* \u2502 ${cmds.length}`);
      bodyLines.push(`  ${top}${overflow}`);
    }

    const bodyText = `\u2726 *${toSmallcaps(menuData.botName + ' Command Matrix')}* \u2726\n\n${bodyLines.join('\n')}`;

    // Build embedded externalAdReply for fallback tiers
    const adReply = {
      title:                 menuData.botName,
      body:                  `${menuData.totalCommands} commands \u2502 ${menuData.uptime}`,
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

    // ── Tier 1: sendButtonsCard (.about style) ─────────────────────────────
    const thumbnail = resolveThumbnail(imgData, ASSET_URLS?.thumbnail);
    const aboutCtx  = buildAboutContextInfo({ botName: menuData.botName, description: `${menuData.totalCommands} commands`, thumbnail: imgData?.buffer });
    if (capabilities.nativeFlow) {
      try {
        return await baileysBridge.sendButtonsCard(sock, m.from, {
          body:      bodyText,
          footer:    footerText,
          title:     menuData.botName,
          subtitle:  `${menuData.totalCommands} commands \u2502 ${menuData.uptime}`,
          thumbnail,
          buttons: [
            { displayText: '\u{1F4CB} All Commands', id: `${menuData.prefix}menu all`, type: 1 },
            buildNavigationButton(menuData.prefix),
          ],
          contextInfo: aboutCtx,
        }, { quoted: menuData.audioQuote || m });
      } catch (err) {
        console.warn('[MENU richCard] Tier 1 (sendButtonsCard) failed, trying richResponse:', err.message);
      }
    }

    // ── Tier 2: Rich Response with native table ─────────────────────────
    // GATE: richResponseMessage is unrenderable without a Meta-signed bot
    // certificate (core/capabilities.js) — the send succeeds and clients show
    // the "your version of WhatsApp" placeholder instead of the menu.
    if (capabilities.richResponse) {
    try {
      const richContent = {
        headerText: `\u2726 ${toSmallcaps(menuData.botName + ' Command Matrix')} \u2726`,
        contentText: `${toSmallcaps('Total Commands')}: ${menuData.totalCommands}\n${toSmallcaps('Categories')}: ${categories.length}\n${toSmallcaps('Prefix')}: ${menuData.prefix}`,
        table: tableRows,
        footerText: toSmallcaps('Powered by') + ' ' + menuData.botName,
      };
      return await baileysBridge.sendRichResponse(sock, m.from, richContent, { quoted: menuData.audioQuote || m });
    } catch (err) {
      console.warn('[MENU richCard] Tier 2 (richResponse table) failed, trying interactive card:', err.message);
    }
    } // end capabilities.richResponse gate

    // ── Tier 3: sendInteractive with image header + embedded externalAdReply ──
    const imagePayload = imgData.source?.startsWith('http')
      ? { url: imgData.source }
      : (imgData.buffer || undefined);

    try {
      if (capabilities.nativeFlow) {
        return await baileysBridge.sendInteractive(sock, m.from, {
          body:    bodyText,
          footer:  footerText,
          header:  {
            title: `\u2726 ${toSmallcaps('Command Matrix')} \u2726`,
            subtitle: `${menuData.totalCommands} ${toSmallcaps('commands')} \u2502 ${categories.length} ${toSmallcaps('categories')}`,
            ...(imagePayload ? { image: imagePayload } : {}),
          },
          buttons: [
            { name: 'quick_reply', params: { display_text: `\u{1F4CB} ${toSmallcaps('Browse Styles')}`, id: `${menuData.prefix}menulist` } },
            { name: 'quick_reply', params: { display_text: `\u{1F680} ${toSmallcaps('System Stats')}`, id: `${menuData.prefix}menu aiDynamic` } },
            { name: 'cta_url', params: { display_text: `\u{1F4AC} ${toSmallcaps('Contact Dev')}`, url: 'https://wa.me/233533416608' } },
          ],
          contextInfo: { externalAdReply: adReply },
        }, { quoted: menuData.audioQuote || m });
      }
    } catch (err) {
      console.warn('[MENU richCard] Tier 3 (interactive + adReply) failed, trying text banner:', err.message);
    }

    // ── Tier 4: text + externalAdReply banner ────────────────────────────
    try {
      const fullText = bodyText + '\n\n' + buildTextMenu(menuData);
      return await sock.sendMessage(m.from, {
        text: fullText,
        contextInfo: { externalAdReply: adReply },
      }, { quoted: menuData.audioQuote || m });
    } catch (err) {
      console.warn('[MENU richCard] Tier 4 (text + adReply) failed, escalating to plain text:', err.message);
    }

    // ── Tier 5: guaranteed plain text + fake quote + banner ────────────────
    const fakeImgQuote = buildFakeImageQuote({ jpegThumbnail: imgData.buffer || undefined });
    return await sock.sendMessage(m.from, {
      text:        `\u2726 *${toSmallcaps(menuData.botName + ' Command Matrix')}* \u2726\n\n` + buildTextMenu(menuData),
      contextInfo: { externalAdReply: adReply },
    }, { quoted: fakeImgQuote });
  },
};

export default richCardMenu;
