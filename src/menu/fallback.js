import { buildTextMenu } from './formatter.js';
import { imageManager } from '../images/imageManager.js';
import { menuManager } from './manager.js';
import { buildMenuBanner } from '../lib/waUtils.js';
import { renderMenuBanner } from '../lib/cardEngine.js';
import brand from '../../config/brand.js';

/**
 * Executes a menu renderer inside a try/catch containment zone.
 * If the renderer crashes, is unsupported by the platform, hangs, or
 * completes without ever sending a message ("dead silent"), it falls
 * back to sending a formatted text menu with a fake product catalog
 * quote + externalAdReply banner (.about command style).
 *
 * Dead-silence watchdog (2026-09-22): styles 12 (aiDynamic) and 14
 * (orderMessage) were reported as producing NOTHING on the live bot.
 * A renderer that hangs (unawaited fetch, locked DB) or returns early
 * without a single sock.sendMessage / sock.relayMessage / m.reply
 * call previously produced no output at all — the old try/catch only
 * caught throws. We now:
 *   1. instrument the socket's send methods during the render and
 *      count every outbound attempt,
 *   2. race the render against a timeout (env MENU_RENDER_TIMEOUT_MS,
 *      default 45s — generous enough for image fetch retries across
 *      all fallback tiers),
 *   3. treat "completed but zero sends" as a failure so the fallback
 *      text menu still reaches the user,
 *   4. name the exact failure mode in the console + the user-facing
 *      notice, so the live-bot logs finally tell us WHY a style dies.
 *
 * @param {Function} renderFn - The active menu renderer function to execute
 * @param {object} context - Context params: { sock, m, menuData }
 */
export const runWithFallback = async (renderFn, { sock, m, menuData }) => {
  // ── 1. Instrument every outbound send path ─────────────────────────────
  const patched = [];
  let sendCount = 0;
  const counting = (fn) => function (...args) { sendCount++; return fn.apply(this, args); };

  for (const method of ['sendMessage', 'relayMessage', 'relayWAMessage']) {
    const orig = sock?.[method];
    if (typeof orig === 'function') {
      sock[method] = counting(orig);
      patched.push([sock, method, orig]);
    }
  }
  // m.reply is its own send path on the serialized message object
  if (typeof m?.reply === 'function' && !m.reply.__counting) {
    const origReply = m.reply;
    m.reply = counting(origReply);
    patched.push([m, 'reply', origReply]);
  }

  const restore = () => {
    for (const [obj, method, orig] of patched) {
      try { obj[method] = orig; } catch { /* frozen/readonly object — leave it */ }
    }
  };

  // ── 2. Watchdog race ──────────────────────────────────────────────────
  const timeoutMs = Number(process.env.MENU_RENDER_TIMEOUT_MS) || 45000;
  let watchdog = null;

  try {
    const result = await Promise.race([
      Promise.resolve(renderFn({ sock, m, menuData })),
      new Promise((_, reject) => {
        watchdog = setTimeout(
          () => reject(new Error(`timed out after ${Math.round(timeoutMs / 1000)}s (watchdog)`)),
          timeoutMs
        );
        // No unref(): the timer is always cleared in finally, so it only
        // lives while a render is genuinely in flight. Unref'ing let Node
        // exit (code 13) before the watchdog fired when the event loop was
        // otherwise empty — a hanging render on an idle bot would die with
        // the process instead of degrading to the text fallback.
      }),
    ]);

    // ── 3. Zero sends = dead silent = treat as failure ──────────────────
    if (sendCount === 0) {
      throw new Error('completed without sending any message (dead-silent render)');
    }

    return result;
  } catch (err) {
    const reason = err?.message || String(err);
    console.error(`[MENU ENGINE] Render failed (${reason}), deploying fallback:`);

    try {
      const fallbackText = buildTextMenu(menuData);
      const notice = `⚠️ *Notice:* The configured premium menu layout (${reason.includes('dead-silent') ? 'sent nothing' : 'hit a render error'}) and safely degraded to standard text.\n\n${fallbackText}`;

      // Fetch the active menu's image for the banner + fake quote
      let visual = {};
      try {
        const activeId = menuManager.getActiveMenu()?.id || 1;
        let imgData;
        try {
          const bannerBuf = await renderMenuBanner({
            botName:       menuData.botName,
            version:       brand.version,
            uptime:        menuData.uptime,
            totalCommands: menuData.totalCommands,
            users:         menuData.users,
          });
          imgData = { buffer: bannerBuf, mimetype: 'image/png', thumbnail: bannerBuf, source: null };
        } catch (bErr) {
          console.warn('[MENU] branded banner failed in fallback, using image pool:', bErr.message || bErr);
          imgData = await imageManager.getMenuImage(activeId);
        }
        visual = buildMenuBanner({
          imgData,
          botName: menuData.botName,
          totalCommands: menuData.totalCommands,
          quoted: m,
        });
      } catch (vErr) {
        console.warn('[MENU ENGINE] Could not build banner for fallback, sending bare text:', vErr.message);
      }

      const sent = await sock.sendMessage(m.from, {
        text: notice,
        ...(visual.contextInfo || {}),
      }, { quoted: visual.quoted || m });
      console.log(`[MENU ENGINE] Fallback text menu delivered (send #${sendCount + 1}).`);
      return sent;
    } catch (fallbackErr) {
      console.error(`[CRITICAL] Menu fallback channel crashed:`, fallbackErr);
    }
  } finally {
    if (watchdog) clearTimeout(watchdog);
    restore();
  }
};

export default runWithFallback;
