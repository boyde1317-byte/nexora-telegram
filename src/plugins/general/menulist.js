import { menuManager } from '../../menu/manager.js';
import { scanCapabilities } from '../../core/baileysScanner.js';
import { selectMenu } from '../../lib/interactiveKit.js';
import { toSmallcaps } from '../../lib/smallcaps.js';
import { buildEnrichedContextInfo } from '../../lib/enrichContext.js';

/**
 * Lists all registered menu presentation styles with accurate compatibility status.
 *
 * UX upgrades:
 *   - Smallcaps styling on headers, names, and descriptions for a refined look
 *   - Interactive selectMenu picker — tap a style to switch instantly (no typing .setmenu)
 *   - Active style highlighted with 👑 and smallcaps label
 *   - Compatibility icons + concise smallcaps descriptions
 *   - Plain-text fallback with smallcaps if nativeFlow is unavailable
 */
export default {
  name: 'menulist',
  aliases: ['styles', 'menus'],
  category: 'general',
  description: 'Lists all available menu presentation styles — tap to switch instantly.',
  cooldown: 2000,
  execute: async ({ sock, m, prefix }) => {
    const p = prefix || '.';

    // 1. Scan live socket capabilities
    const caps = scanCapabilities(sock);

    // 2. Get registered styles + active style
    const styles      = menuManager.getRegisteredMenus();
    const activeStyle = menuManager.getActiveMenu();

    // 3. Build compatibility info per style
    const styleInfo = styles.map(style => {
      const isActive = activeStyle && activeStyle.id === style.id;
      const missing = (style.supportedMessages || []).filter(
        msgType => caps[msgType] === false
      );
      const warned = (style.supportedMessages || []).filter(msgType =>
        msgType === 'requestPaymentMessage' || msgType === 'eventMessage'
      );
      const isIncompat = missing.length > 0;
      const hasWarning = warned.length > 0 && !isIncompat;
      const icon   = isIncompat ? '🟡' : hasWarning ? '🟠' : '🟢';
      const status = isIncompat ? 'fallback' : hasWarning ? 'gated' : 'native';
      return { style, isActive, isIncompat, hasWarning, icon, status, missing };
    });

    // ── Tier 1: Interactive selectMenu — tap to switch ───────────────────
    const totalNative  = styleInfo.filter(s => s.status === 'native').length;
    const totalGated   = styleInfo.filter(s => s.status === 'gated').length;
    const totalFallback = styleInfo.filter(s => s.status === 'fallback').length;

    const headerText = [
      `✦ ${toSmallcaps('Available Menu Styles')} ✦`,
      ``,
      `${toSmallcaps('Active')}: *${toSmallcaps(activeStyle?.name || 'documentInteractive')}* 👑`,
      `${toSmallcaps('Total')}: *${styles.length}* styles`,
      `${toSmallcaps('Compatible')}: 🟢 ${totalNative}  🟠 ${totalGated}  🟡 ${totalFallback}`,
      ``,
      `${toSmallcaps('Tap a style below to switch instantly')}:`,
    ].join('\n');

    const footerText = `${toSmallcaps('NEXORA-MD')} • ${toSmallcaps('Menu Style Picker')}`;

    // Build selectMenu sections — group by compatibility
    const sections = [
      {
        title: toSmallcaps('Fully Supported') + ` (🟢 ${totalNative})`,
        rows: styleInfo
          .filter(s => s.status === 'native')
          .map(s => ({
            id:          `${p}setmenu ${s.style.id}`,
            title:       `${s.isActive ? '👑 ' : ''}${s.style.id}. ${toSmallcaps(s.style.name)}`,
            description: toSmallcaps(s.style.description),
          })),
      },
      {
        title: toSmallcaps('Account-Gated') + ` (🟠 ${totalGated})`,
        rows: styleInfo
          .filter(s => s.status === 'gated')
          .map(s => ({
            id:          `${p}setmenu ${s.style.id}`,
            title:       `${s.isActive ? '👑 ' : ''}${s.style.id}. ${toSmallcaps(s.style.name)}`,
            description: toSmallcaps(s.style.description),
          })),
      },
      {
        title: toSmallcaps('Fallback Mode') + ` (🟡 ${totalFallback})`,
        rows: styleInfo
          .filter(s => s.status === 'fallback')
          .map(s => ({
            id:          `${p}setmenu ${s.style.id}`,
            title:       `${s.isActive ? '👑 ' : ''}${s.style.id}. ${toSmallcaps(s.style.name)}`,
            description: toSmallcaps(s.style.description) + ` — missing: ${s.missing.join(', ')}`,
          })),
      },
    ].filter(section => section.rows.length > 0);

    try {
      return await selectMenu(sock, m.from, {
        text:   headerText,
        footer: footerText,
      }, `🎨 ${toSmallcaps('Choose Style')}`, sections, [
        { kind: 'action', label: `👑 ${toSmallcaps('View Active Menu')}`, cmd: `${p}menu` },
        { kind: 'action', label: `🤖 ${toSmallcaps('System Stats')}`,    cmd: `${p}menu aiDynamic` },
      ], { quoted: m });
    } catch (err) {
      console.warn('[menulist] Interactive selectMenu failed, falling back to text:', err.message);
    }

    // ── Tier 2: Plain text with smallcaps ────────────────────────────────
    let text = `✦ *${toSmallcaps('Available Menu Styles')}* ✦\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    text += `${toSmallcaps('Active')}: *${toSmallcaps(activeStyle?.name || 'documentInteractive')}* 👑\n`;
    text += `${toSmallcaps('Total')}: *${styles.length}* ${toSmallcaps('styles')}\n\n`;
    text += `${toSmallcaps('Set your style with')} \`${p}setmenu <id_or_name>\`\n\n`;

    for (const info of styleInfo) {
      const { style, isActive, isIncompat, hasWarning, icon, missing } = info;
      const activeTag = isActive ? ' 👑' : '';

      text += `${icon} *${style.id}. ${toSmallcaps(style.name)}*${activeTag}\n`;
      text += `  ↳ ${toSmallcaps(style.description)}\n`;

      if (isIncompat) {
        text += `  ↳ ⚠️ *${toSmallcaps('Fallback mode')}* — ${toSmallcaps('missing')}: ${missing.join(', ')}\n`;
      } else if (hasWarning) {
        text += `  ↳ 🟠 *${toSmallcaps('Account-gated')}* — ${toSmallcaps('may need verified business account')}\n`;
      } else {
        text += `  ↳ ✅ ${toSmallcaps('Fully supported')}\n`;
      }

      text += '\n';
    }

    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `🟢 ${toSmallcaps('Native')}  🟠 ${toSmallcaps('Account-gated')}  🟡 ${toSmallcaps('Fallback')}\n\n`;
    text += `${toSmallcaps('Tap the style picker above to switch instantly,')} ${toSmallcaps('or use')} \`${p}setmenu <id>\``;

    await m.reply(text, { contextInfo: buildEnrichedContextInfo() });
  },
};
