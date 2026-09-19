import { getGreeting, divider } from '../formatter.js';
import { db } from '../../database/db.js';
import { imageManager } from '../../images/imageManager.js';
import { capabilities } from '../../core/capabilities.js';
import { baileysBridge } from '../../core/baileysBridge.js';
import { toSmallcaps } from '../../lib/smallcaps.js';
import { asciiBuilder } from '../../ui/asciiBuilder.js';
import { buildFakeImageQuote } from '../../lib/waUtils.js';
import { buildNavigationButton, buildPillButton, buildPillUrlButton, buildPillCopyButton } from './buttonsCard.js';

/**
 * AI-Dynamic Menu (id: 12) \u2014 enhanced for rich-messages.
 *
 * Upgraded visual dashboard with:
 *   - ASCII progress bars for system health and memory
 *   - Multi-section layout with box-drawing panels
 *   - Stat row badges with icons
 *   - sendInteractive with image header + subtitle + embedded adReply
 *   - Richer dynamic stats: command rankings, user tier, group status
 *   - Random themed accent per render for visual variety
 *
 * Tiers:
 *   1 \u2192 sendInteractive with image header + subtitle + embedded adReply
 *   2 \u2192 nativeFlow interactive card with image header + buttons
 *   3 \u2192 text + externalAdReply banner
 */
const THEMES = [
  { name: 'COSMIC SLATE',    accent: '\u2726' },
  { name: 'CYBERPUNK NEON',  accent: '\u26A1' },
  { name: 'MATRIX DIGITAL',  accent: '\u25C8' },
  { name: 'AURORA FLOW',     accent: '\u2744' },
  { name: 'PHANTOM CORE',    accent: '\u2764' },
];

export const aiDynamicMenu = {
  id: 12,
  name: 'aiDynamic',
  description: 'AI-Dynamic system dashboard with auto-theming, progress bars, command rankings, and user stats',
  supportedMessages: ['interactiveMessage', 'nativeFlowMessage', 'extendedTextMessage'],

  renderer: async ({ sock, m, menuData }) => {
    const imgData = await imageManager.getMenuImage(12);

    // 1. Pick a random design theme
    const theme = THEMES[Math.floor(Math.random() * THEMES.length)];

    // 2. Compute dynamic command ranking from database metrics
    const stats = db.data.stats?.commandsUsed || {};
    const ranking = Object.entries(stats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    let rankingText = '';
    if (ranking.length > 0) {
      const maxCount = ranking[0][1] || 1;
      rankingText = ranking.map(([name, count], i) => {
        const bar = asciiBuilder.progressBar(Math.round((count / maxCount) * 100), 10, '');
        return `  ${i + 1}. \`${name}\`\n     ${bar}`;
      }).join('\n');
    } else {
      rankingText = '  _No commands recorded yet._';
    }

    // 3. User & Group contextual statistics
    const userDb = db.getUser(m.sender);
    const isGroup = m.isGroup;
    const groupDb = isGroup ? db.getGroup(m.from) : null;

    // 4. Compute fake system health metrics for visual bars
    const memUsage = process.memoryUsage();
    const memPercent = Math.min(100, Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100));
    const pingMs = 80 + Math.floor(Math.random() * 60);
    const healthPercent = Math.max(20, Math.min(100, 100 - Math.floor(pingMs / 4)));

    // 5. Compile the themed dashboard with enhanced visuals
    let text = `${theme.accent} *${toSmallcaps(theme.name)}* ${theme.accent}\n`;
    text += `_${getGreeting()}!_\n`;
    text += `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n`;

    // ── System Health Section ───────────────────────────────────────────
    text += `\u250C\u2500 *${toSmallcaps('System Health')}*\n`;
    text += `\u2502 ${asciiBuilder.progressBar(healthPercent, 14, 'Load')}\n`;
    text += `\u2502 ${asciiBuilder.progressBar(memPercent, 14, 'RAM')}\n`;
    text += `\u2502 ${asciiBuilder.statRow('Latency', `~${pingMs}ms`)}\n`;
    text += `\u2502 ${asciiBuilder.statRow('Uptime', menuData.uptime)}\n`;
    text += `\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n`;

    // ── Command Rankings Section ─────────────────────────────────────────
    text += `\u250C\u2500 *${toSmallcaps('Command Rankings')}*\n`;
    text += `${rankingText.split('\n').map(l => l ? `\u2502 ${l}` : '\u2502').join('\n')}\n`;
    text += `\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n`;

    // ── User Context Section ─────────────────────────────────────────────
    text += `\u250C\u2500 *${toSmallcaps('User Context')}*\n`;
    text += `\u2502 ${asciiBuilder.statRow('Rank', userDb?.premium ? '\u2B50 Premium' : 'Standard')}\n`;
    if (isGroup) {
      text += `\u2502 ${asciiBuilder.statRow('Group', groupDb?.mute ? 'Muted' : 'Active')}\n`;
    }
    text += `\u2502 ${asciiBuilder.statRow('Commands', menuData.totalCommands)}\n`;
    text += `\u2502 ${asciiBuilder.statRow('Prefix', menuData.prefix)}\n`;
    text += `\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n`;

    // ── Available Modules Section ────────────────────────────────────────
    text += `\u250C\u2500 *${toSmallcaps('Available Modules')}*\n`;
    const categories = Object.keys(menuData.categories).sort();
    for (const cat of categories) {
      const cmdCount = menuData.categories[cat].length;
      const list = menuData.categories[cat].slice(0, 4).map(c => `\`${c.name}\``).join(', ');
      const overflow = menuData.categories[cat].length > 4 ? ` +${menuData.categories[cat].length - 4}` : '';
      text += `\u2502 \u2726 *${toSmallcaps(cat)}* (${cmdCount})\n\u2502   ${list}${overflow}\n`;
    }
    text += `\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n`;

    // ── Status Badges ────────────────────────────────────────────────────
    text += `${asciiBuilder.badge('Status', 'OPTIMAL')}  `;
    text += `${asciiBuilder.badge('Engine', 'Baileys')}  `;
    text += `${asciiBuilder.badge('Theme', theme.name)}\n`;

    text += `\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n`;
    text += `${toSmallcaps('Powered by')} \u2726 ${menuData.botName} \u2726`;

    // 5. Build image payload
    const imagePayload = imgData.source?.startsWith('http')
      ? { url: imgData.source }
      : (imgData.buffer || undefined);

    const footerText = `${menuData.botName} \u2502 ${menuData.totalCommands} commands \u2502 ${theme.name}`;

    // Build embedded externalAdReply
    const adReply = {
      title:                 `${menuData.botName} ${toSmallcaps('AI')}`,
      body:                  `${menuData.totalCommands} ${toSmallcaps('commands')} \u2502 ${toSmallcaps('Dynamic Dashboard')}`,
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
    if (capabilities.interactive && imagePayload) {
      try {
        return await baileysBridge.sendButtonsCard(sock, m.from, {
          body:       text,
          footer:     footerText,
          title:      `${theme.accent} ${toSmallcaps(theme.name)} ${theme.accent}`,
          subtitle:   `${toSmallcaps('Dynamic Dashboard')} \u2502 ${menuData.totalCommands} ${toSmallcaps('commands')}`,
          thumbnail:  imagePayload,
          buttons: [
            buildPillButton(`\u{1F4CB} ${toSmallcaps('Browse Menu Styles')}`, `${menuData.prefix}menulist`),
            buildPillButton(`\u{1F3D1} ${toSmallcaps('Ping Bot')}`,           `${menuData.prefix}ping`),
            buildPillUrlButton(`\u{1F4AC} ${toSmallcaps('Contact Developer')}`, 'https://wa.me/233533416608'),
            buildNavigationButton(menuData.prefix),
          ],
          contextInfo: { externalAdReply: adReply, ...(menuData.channelPill || {}), mentionedJid: [m.sender] },
        }, { quoted: menuData.audioQuote || m });
      } catch (err) {
        console.warn('[MENU aiDynamic] Tier 1 (sendInteractive + adReply) failed, trying nativeFlow:', err.message);
      }
    }

    // ── Tier 2: nativeFlow interactive card with buttons ───────────────────
    if (capabilities.nativeFlow) {
      try {
        return await baileysBridge.sendNativeFlow(sock, m.from, {
          text:    text,
          footer:  footerText,
          image:   imagePayload,
          buttons: [
            { text: `\u{1F4CB} ${toSmallcaps('Browse Menu Styles')}`, id: `${menuData.prefix}menulist` },
            { text: `\u{1F3D1} ${toSmallcaps('Ping Bot')}`,           id: `${menuData.prefix}ping` },
            { text: `\u{1F4AC} ${toSmallcaps('Contact Developer')}`,   url: 'https://wa.me/233533416608' },
          ],
        }, { quoted: menuData.audioQuote || m });
      } catch (err) {
        console.warn('[MENU aiDynamic] Tier 2 (nativeFlow) failed, trying adReply:', err.message);
      }
    }

    // ── Tier 3: text + externalAdReply banner ─────────────────────────────
    return await sock.sendMessage(m.from, {
      text,
      mentions:    m.isGroup ? [m.sender] : [],
      contextInfo: { externalAdReply: adReply, ...(menuData.channelPill || {}) },
    }, { quoted: buildFakeImageQuote({ jpegThumbnail: imgData.buffer || undefined }) });
  }
};

export default aiDynamicMenu;
