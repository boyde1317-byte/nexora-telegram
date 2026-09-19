/**
 * @file src/assets/defaultAssets.js
 *
 * Default asset URLs for NEXORA-MD. All defaults are CDN-hosted URLs — no
 * local files are generated, downloaded, or stored. WhatsApp renders these
 * via the externalAdReply `thumbnailUrl` (link-preview) field, so the bot
 * never needs to touch disk for visual assets.
 *
 * The `ensureDefaultAssets()` function is kept as a no-op for backward
 * compatibility with the startup sequence (assetManager.init still calls it),
 * but it no longer creates directories or downloads anything.
 */

import { ASSET_URLS } from './assetUrls.js';

// ── Legacy path references — still exported for any code that reads
//    DEFAULT_PATHS, but these now resolve to URLs, not local files.
//    New code should import ASSET_URLS directly instead.
export const DEFAULT_PATHS = {
  menuBanner:   ASSET_URLS.menuBanner,
  welcome:      ASSET_URLS.welcome,
  goodbye:      ASSET_URLS.goodbye,
  thumbnail:    ASSET_URLS.thumbnail,
  docThumbnail: ASSET_URLS.docThumbnail,
};

// Online fallback URLs — same as DEFAULT_PATHS but kept as a separate export
// for any code that references ONLINE_FALLBACKS directly.
const ONLINE_FALLBACKS = { ...ASSET_URLS };

/**
 * No-op — previously created directories and downloaded/fetched images.
 * Now all defaults are CDN URLs, so there's nothing to prepare on disk.
 * Kept for backward compatibility with the startup sequence.
 */
export async function ensureDefaultAssets() {
  // Nothing to do — all assets are URL-based now.
  console.log('[DEFAULT ASSETS] All default assets are CDN-hosted URLs — no local files needed.');
}

export default {
  DEFAULT_PATHS,
  ensureDefaultAssets,
  ONLINE_FALLBACKS,
};
