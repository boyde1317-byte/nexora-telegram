import capabilities from '../../core/capabilities.js';
import { Button } from '../../lib/moonsonKit.js';
import { buildTextMenu } from '../formatter.js';
import { toSmallcaps } from '../../lib/smallcaps.js';
import { buildAboutContextInfo } from '../../lib/waUtils.js';

/**
 * Moonson-style Menu (id: 18) — NIXCODE Button card.
 *
 * Full port of Moonson's .menu look, built on moonsonKit.Button
 * (NIXCODE v4.5, routed through baileysBridge):
 *   - Interactive card with image header + title/subtitle
 *   - single_select "Navigation" sheet listing every command category
 *     (tapping a row runs `.help <category>`)
 *   - quick_reply pills for menu actions
 *   - cta_url / cta_copy utilities
 *
 * Everything here rides interactiveMessage/nativeFlowMessage — renders on
 * all modern clients, no bot-certificate envelope involved.
 */
export const moonsonCardMenu = {
  id: 18,
  name: 'moonsonCard',
  description: 'Moonson-style NIXCODE card — image header, category navigation sheet, pill buttons',
  supportedMessages: ['interactiveMessage', 'nativeFlowMessage'],

  renderer: async ({ sock, m, menuData }) => {
    const bodyText = buildTextMenu(menuData);
    const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);

    // ── Image header (best-effort — card renders fine without media) ──
    let imgData = null;
    try {
      const { imageManager } = await import('../../images/imageManager.js');
      imgData = await imageManager.getMenuImage(18);
    } catch {
      // No image configured — plain header card
    }

    const card = new Button(sock)
      .setTitle(`✦ ${menuData.botName} ✦`)
      .setSubtitle(`${menuData.totalCommands} commands │ ${menuData.uptime}`)
      .setBody(bodyText)
      .setFooter(`Powered by ${menuData.botName}`)
      .setContextInfo(buildAboutContextInfo({
        botName: menuData.botName,
        description: `${menuData.totalCommands} commands`,
        thumbnail: imgData?.buffer,
      }));

    if (imgData?.buffer) {
      card.setMedia({ image: imgData.buffer, mimetype: imgData.mimetype || 'image/jpeg' });
    } else if (imgData?.source?.startsWith('http')) {
      card.setImage(imgData.source);
    }

    // ── single_select navigation sheet — one row per command category ──
    const categories = Object.keys(menuData.categories || {});
    if (categories.length > 0) {
      card.addSelection(toSmallcaps('Select Category'));
      card.makeSection(toSmallcaps(`${menuData.totalCommands} Commands`));
      for (const cat of categories) {
        const count = (menuData.categories[cat] || []).length;
        card.makeRow(
          '',
          titleCase(cat),
          `${count} command${count !== 1 ? 's' : ''}`,
          `${menuData.prefix}help ${cat}`,
        );
      }
    }

    // ── Action pills ──
    card.addReply(`📋 ${toSmallcaps('Menu Styles')}`, `${menuData.prefix}menulist`);
    card.addReply(`⚡ ${toSmallcaps('System Info')}`, `${menuData.prefix}ping`);
    card.addUrl(`💬 ${toSmallcaps('Contact Developer')}`, `https://wa.me/${(menuData.ownerNumber || '').replace(/\D/g, '')}`);
    card.addCopy(`📎 ${toSmallcaps('Copy Prefix')}`, menuData.prefix);

    await card.send(m.from, { quoted: menuData.audioQuote || m });
  },
};

export default moonsonCardMenu;
