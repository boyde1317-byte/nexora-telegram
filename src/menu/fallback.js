import { buildTextMenu } from './formatter.js';
import { imageManager } from '../images/imageManager.js';
import { menuManager } from './manager.js';
import { buildMenuBanner } from '../lib/waUtils.js';

/**
 * Executes a menu renderer inside a try/catch containment zone.
 * If the renderer crashes or is unsupported by the platform,
 * it falls back to sending a beautifully formatted text menu with a
 * fake product catalog quote + externalAdReply banner (.about command style).
 * 
 * @param {Function} renderFn - The active menu renderer function to execute
 * @param {object} context - Context params: { sock, m, menuData }
 */
export const runWithFallback = async (renderFn, { sock, m, menuData }) => {
  try {
    await renderFn({ sock, m, menuData });
  } catch (err) {
    console.error(`[MENU ENGINE] Render failed, deploying fallback:`, err.message || err);
    
    try {
      const fallbackText = buildTextMenu(menuData);
      const notice = `⚠️ *Notice:* The configured premium menu layout encountered a render error and safely degraded to standard text.\n\n${fallbackText}`;

      // Fetch the active menu's image for the banner + fake quote
      let visual = {};
      try {
        const activeId = menuManager.getActiveMenu()?.id || 1;
        const imgData  = await imageManager.getMenuImage(activeId);
        visual = buildMenuBanner({
          imgData,
          botName: menuData.botName,
          totalCommands: menuData.totalCommands,
          quoted: m,
        });
      } catch (vErr) {
        console.warn('[MENU ENGINE] Could not build banner for fallback, sending bare text:', vErr.message);
      }

      await sock.sendMessage(m.from, {
        text: notice,
        ...(visual.contextInfo || {}),
      }, { quoted: visual.quoted || m });
    } catch (fallbackErr) {
      console.error(`[CRITICAL] Menu fallback channel crashed:`, fallbackErr);
    }
  }
};

export default runWithFallback;
