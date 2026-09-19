/**
 * Buttons Card Menu (id: 5) — buttonsMessage format.
 *
 * This is the "grey text" card style: the body is wrapped in monospace
 * (triple backticks) so WhatsApp renders it in a muted/grey color.
 * The header uses a locationMessage with a high-quality thumbnail (300x300),
 * and the subtitle shows live time + status — exactly like the look from
 * BIGST4CK's ButtonV2 builder.
 *
 * Two modes:
 *   • Main menu (no args) → greeting body + system stats footer + Store + Navigation
 *   • Category menu (args) → monospace command list (grey) + simple footer + Main Menu + Navigation
 *
 * The biz/native_flow additionalNodes stanza is injected automatically
 * by baileysBridge.relayMessage() (hasNativeFlowContent checks buttonsMessage).
 */
import os from 'os';
import { baileysBridge } from '../../core/baileysBridge.js';
import { buildTextMenu } from '../formatter.js';
import { getGreeting } from '../formatter.js';
import { imageManager } from '../../images/imageManager.js';
import { buildFakeProductQuote } from '../../lib/waUtils.js';
import brand from '../../../config/brand.js';
import owner from '../../../config/owner.js';
import { ASSET_URLS } from '../../assets/assetUrls.js';

/**
 * Build the productMessage catalog quote used as contextInfo.
 * This is what makes the card render as a "business catalog forward"
 * — the quoted reply bar shows a product card with the bot name.
 */
function buildCatalogQuote(thumbnail) {
  return buildFakeProductQuote({
    title:           brand.name,
    description:     brand.description || `${brand.name} by ${brand.creator}`,
    currencyCode:   'BTC',
    priceAmount1000: 100000000,
    businessOwnerJid: '0@s.whatsapp.net',
    ...(thumbnail ? { jpegThumbnail: thumbnail } : {}),
  });
}

/**
 * Build the navigation single_select button (native flow list picker).
 * Opens a modal sheet with all command categories — tapping one runs
 * `.menu <category>` to show that category's commands.
 */
export function buildNavigationButton(prefix) {
  const p = prefix || '.';
  // NOTE: these route through `.help <category>` (real command-category
  // browser), NOT `.menu <category>` — `.menu` only accepts a menu STYLE
  // name/id (aiDynamic, buttonsCard, etc.), it has no concept of command
  // categories. Category names below match the real `category:` values
  // used across src/plugins/ (verified against the plugin source).
  const categories = [
    { title: 'All Commands', description: 'Browse every category', id: `${p}help` },
    { title: 'AI',           description: 'AI chat & generation',  id: `${p}help ai` },
    { title: 'Download',     description: 'Media downloaders',     id: `${p}help download` },
    { title: 'Utility',      description: 'Utility commands',      id: `${p}help utility` },
    { title: 'Games',        description: 'Mini games',            id: `${p}help games` },
    { title: 'Group',        description: 'Group management',      id: `${p}help group` },
    { title: 'Media',        description: 'Media & sticker tools', id: `${p}help media` },
    { title: 'Owner',        description: 'Owner commands',        id: `${p}help owner` },
    { title: 'About',        description: 'Bot info',              id: `${p}about` },
  ];
  return {
    buttonText: { displayText: '☰ Navigation' },
    buttonId: 'menu_nav',
    type: 1,
    nativeFlowInfo: {
      name: 'single_select',
      paramsJson: JSON.stringify({
        title: 'Select Category',
        sections: [{
          title: `${brand.name} Menu`,
          rows: categories,
        }],
      }),
    },
  };
}

export const buttonsCardMenu = {
  id: 5,
  name: 'buttonsCard',
  description: 'Grey-text buttons card with high-quality thumbnail header, live time, and tappable pill buttons',
  supportedMessages: ['buttonsMessage'],

  renderer: async ({ sock, m, menuData }) => {
    // ── Time & status (for the header subtitle) ───────────────────────────
    const tz = process.env.BOT_TZ || 'Africa/Accra';
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });

    const cpuLoad  = os.loadavg()[0];
    const cpuCores = os.cpus().length;
    const loadPct  = (cpuLoad / cpuCores) * 100;
    const ramPct   = ((os.totalmem() - os.freemem()) / os.totalmem()) * 100;
    const serverStatus = loadPct > 80 || ramPct > 85 ? 'Degraded' : 'Online';

    // ── Thumbnail: high-quality brand image ───────────────────────────────
    let thumbnail = ASSET_URLS.thumbnail;
    let thumbnailBuffer = null;
    try {
      const imgData = await imageManager.getMenuImage(5);
      if (imgData?.source?.startsWith('http')) {
        thumbnail = imgData.source;
      } else if (imgData?.buffer) {
        thumbnail = imgData.buffer;
        thumbnailBuffer = imgData.buffer;
      }
    } catch (_) {}

    // ── Catalog quote (productMessage fake quote for the reply bar) ───────
    const catalogQuote = buildCatalogQuote(thumbnailBuffer);

    // ── Build contextInfo with the catalog quote ──────────────────────────
    const contextInfo = {
      stanzaId:      catalogQuote.key.id || 'catalog',
      participant:   catalogQuote.key.participant,
      remoteJid:     catalogQuote.key.remoteJid,
      quotedMessage: catalogQuote.message,
    };

    // ── Check if this is a category-specific menu (args passed) ───────────
    const p = menuData.prefix || '.';
    const categoryArg = m.text?.split(/\s+/)?.[1]?.toLowerCase();
    const isCategoryMenu = categoryArg && categoryArg !== 'all';

    if (isCategoryMenu) {
      // ── CATEGORY MENU: monospace command list (grey text) ───────────────
      const menuText = buildTextMenu(menuData);
      const bodyText = '```' + menuText + '```';

      const footerText =
        `${brand.name} v${brand.version} · ${menuData.totalCommands} commands\n` +
        `${brand.signature}`;

      const buttons = [
        { displayText: '📋 Main Menu', id: `${p}menu`, type: 1 },
        { displayText: '📜 All Commands', id: `${p}menu all`, type: 1 },
        buildNavigationButton(p),
      ];

      return await baileysBridge.sendButtonsCard(sock, m.from, {
        body:       bodyText,
        footer:     footerText,
        title:      brand.name,
        subtitle:   `${serverStatus} · ${timeStr}`,
        thumbnail,
        buttons,
        contextInfo,
      }, { quoted: m });

    } else {
      // ── MAIN MENU: greeting body + system stats footer ─────────────────
      const greeting = getGreeting();
      const senderNumber = m.senderNumber || m.sender?.split('@')[0] || '';

      // Body: greeting + date/time (regular text, NOT monospace — like BIGST4CK)
      const bodyText =
        `${greeting}, @${senderNumber}\n` +
        `${dateStr} · ${timeStr}`;

      // Footer: system stats with bold labels and progress bars (› style)
      const memUsage = process.memoryUsage();
      const ramMb = (memUsage.heapUsed / 1024 / 1024).toFixed(1);
      const totalMem = os.totalmem();
      const usedMem = totalMem - os.freemem();
      const fmtRAM = (b) => {
        const mb = b / 1024 / 1024;
        return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(0)} MB`;
      };

      const createBar = (percent, maxBlocks = 8) => {
        const filled = Math.round((percent / 100) * maxBlocks);
        return '█'.repeat(filled) + '░'.repeat(maxBlocks - filled);
      };

      const footerText =
        `*»* *USER*\n` +
        `  › *Status:* ${m.isOwner ? 'Owner' : 'User'}\n` +
        `  › *Prefix:* ${p}\n\n` +
        `*»* *SYSTEM*\n` +
        `  › *Status:* ${serverStatus}\n` +
        `  › *Uptime:* ${menuData.uptime}\n` +
        `  › *RAM:* ${fmtRAM(usedMem)}/${fmtRAM(totalMem)} ${createBar(ramPct, 8)}\n` +
        `  › *CPU:* ${createBar(Math.min(loadPct, 100), 10)} ${Math.round(loadPct)}%\n` +
        `  › *Commands:* ${menuData.totalCommands}\n` +
        `  › *Users:* ${menuData.users}\n` +
        `  › *Groups:* ${menuData.groups}\n` +
        `  › *Version:* v${brand.version}\n\n` +
        `${brand.name} ${brand.signature}`;

      // Buttons: Store/quick action + Navigation single_select
      const buttons = [
        { displayText: '📋 All Commands', id: `${p}menu all`, type: 1 },
        { displayText: '🤖 System Info',  id: `${p}about`,    type: 1 },
        buildNavigationButton(p),
      ];

      // Add mentionedJid for the @sender mention in body
      const contextInfoWithMention = {
        ...contextInfo,
        mentionedJid: m.sender ? [m.sender] : [],
      };

      return await baileysBridge.sendButtonsCard(sock, m.from, {
        body:       bodyText,
        footer:     footerText,
        title:      brand.name,
        subtitle:   `${serverStatus} · ${timeStr}`,
        thumbnail,
        buttons,
        contextInfo: contextInfoWithMention,
      }, { quoted: m });
    }
  },
};

export default buttonsCardMenu;

/**
 * Build a pill-style quick_reply button for buttonsMessage.
 */
export function buildPillButton(text, id) {
  return { displayText: text, id, type: 1 };
}

/**
 * Build a pill-style CTA URL button for buttonsMessage.
 * Renders as a pill but opens the URL when tapped.
 */
export function buildPillUrlButton(text, url) {
  return {
    displayText: text,
    id: 'cta_url_' + Math.random().toString(36).slice(2, 8),
    type: 1,
    nativeFlowInfo: {
      name: 'cta_url',
      paramsJson: JSON.stringify({ display_text: text, url }),
    },
  };
}

/**
 * Build a pill-style CTA Copy button for buttonsMessage.
 * Renders as a pill but copies text to clipboard when tapped.
 */
export function buildPillCopyButton(text, copyCode) {
  return {
    displayText: text,
    id: 'cta_copy_' + Math.random().toString(36).slice(2, 8),
    type: 1,
    nativeFlowInfo: {
      name: 'cta_copy',
      paramsJson: JSON.stringify({ display_text: text, copy_code: copyCode }),
    },
  };
}
