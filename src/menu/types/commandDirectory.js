/**
 * @file src/menu/types/commandDirectory.js
 *
 * Command Directory Menu (id: 17) — the native replacement for the ASCII
 * command wall. The old menu styles all embed buildTextMenu() as the card
 * body: ~178 command names wrapped inside text borders — readable, but a
 * wall of text on every .menu.
 *
 * This style renders a compact stat card with a single_select picker:
 *   📂 Browse Categories → sectioned picker, one row per category
 *     (emoji, count, sample commands) → tap dispatches `.help <category>`
 *     → .help renders that category's commands as a second picker →
 *     tap dispatches `.help <command>` → full command detail card.
 *
 * Every hop rides primitives that are already device-proven: the same
 * selectMenu single_select used by .play/.menulist, and .help's drill-down
 * (see plugins/general/help.js). No command names in the card body at all.
 *
 * Tiers:
 *   1 → selectMenu category picker (interactive)
 *   2 → legacy listMessage-style text body (buildTextMenu) — the old look,
 *       used only when interactive cards are unavailable
 */

import { withChannelPill } from '../../lib/menuContext.js';
import capabilities from '../../core/capabilities.js';
import { selectMenu } from '../../lib/interactiveKit.js';
import { toSmallcaps } from '../../lib/smallcaps.js';
import { buildTextMenu } from '../formatter.js';
import { imageManager } from '../../images/imageManager.js';
import { buildCategoryIndex, categoryEmoji, titleize } from '../../lib/commandDirectory.js';

export const commandDirectoryMenu = {
  id: 17,
  name: 'commandDirectory',
  description: 'Native command directory — stat card + tappable category picker that drills into .help',
  supportedMessages: ['buttonsMessage', 'nativeFlowMessage'],

  renderer: async ({ sock, m, menuData }) => {
    const p = menuData.prefix || '.';
    const byCat = buildCategoryIndex();

    // ── Tier 1: native category picker ─────────────────────────────────
    if (capabilities.interactive && byCat.size) {
      try {
        const rows = [...byCat.entries()].map(([cat, cmds]) => ({
          id:    `${p}help ${cat}`,
          title: `${categoryEmoji(cat)} ${titleize(cat)} (${cmds.length})`,
          description: cmds.slice(0, 4).map(c => c.name).join(', ') + (cmds.length > 4 ? ` … +${cmds.length - 4}` : ''),
        }));

        const bodyText = [
          `✦ *${toSmallcaps(menuData.botName)}* ✦`,
          ``,
          `👑 ${toSmallcaps('Owner')}: *${menuData.ownerName}*  •  ⏱ ${toSmallcaps('Uptime')}: *${menuData.uptime}*`,
          `⚡ ${toSmallcaps('Prefix')}: *${p}*  •  📦 *${byCat.size}* ${toSmallcaps('categories')}  •  *${menuData.totalCommands}* ${toSmallcaps('commands')}`,
          ``,
          `📂 ${toSmallcaps('Tap "Browse Categories" and pick a section — every command is one tap away, with its own detail page via')} ${toSmallcaps('.help')}`,
        ].join('\n');

        return await selectMenu(sock, m.from, {
          text:     bodyText,
          title:    `✦ ${toSmallcaps('Command Directory')} ✦`,
          subtitle: `${toSmallcaps('categories')} → ${toSmallcaps('commands')} → ${toSmallcaps('details')}`,
          footer:   `${menuData.botName} • ${toSmallcaps('tap a category to browse')}`,
        }, `📂 ${toSmallcaps('Browse Categories')}`, [
          { title: toSmallcaps('Categories'), rows },
        ], [
          { label: `🎨 ${toSmallcaps('Menu Styles')}`, cmd: `${p}menulist` },
          { label: `📜 ${toSmallcaps('Full Text List')}`,   cmd: `${p}menu 1` },
          { label: `🏓 ${toSmallcaps('Ping')}`,          cmd: `${p}ping` },
        ], { quoted: m });
      } catch (err) {
        console.warn('[MENU commandDirectory] picker failed, falling back to text:', err.message);
      }
    }

    // ── Tier 2: the classic text menu (guaranteed) ─────────────────────
    const imgData = await imageManager.getMenuImage(17).catch(() => null);
    if (imgData?.buffer || imgData?.source) {
      const imagePayload = imgData.source?.startsWith('http')
        ? { url: imgData.source }
        : imgData.buffer;
      return await sock.sendMessage(m.from, {
        image: imagePayload,
        caption: buildTextMenu(menuData),
        contextInfo: withChannelPill(),
      }, { quoted: m });
    }
    return await sock.sendMessage(m.from, {
      text: buildTextMenu(menuData),
      contextInfo: withChannelPill(),
    }, { quoted: m });
  },
};

export default commandDirectoryMenu;
