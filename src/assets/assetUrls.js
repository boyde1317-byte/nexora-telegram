/**
 * @file src/assets/assetUrls.js
 * Central registry of branded CDN-hosted image URLs for NEXORA-MD.
 *
 * Every visual surface in the bot (menu banners, welcome/goodbye cards,
 * ad-reply thumbnails, document cards, interactive menus) references these
 * URLs via WhatsApp's externalAdReply `thumbnailUrl` field — the link-preview
 * format. This means:
 *
 *   • No image files stored locally — zero disk I/O, zero BMP generation,
 *     zero "file not found" fallbacks to null.
 *   • WhatsApp servers fetch and cache the thumbnail from the URL, so it
 *     renders even if the bot's own filesystem is ephemeral (Railway, Render).
 *   • Updating a visual is a one-line change here, not a re-deploy.
 *
 * If an owner sets a custom image via `!setwelcomeimage` etc., the manual
 * override (stored in the database) takes priority over these defaults.
 */

// ── Branded visual URLs (CDN-hosted, publicly accessible) ────────────────────
export const ASSET_URLS = {
  // Square logo / thumbnail — used in ad-reply cards, about, version, etc.
  thumbnail:
    'https://media.base44.com/images/public/6a6ffc9ec8a196324ba9ee95/d1347bb68_generated_image.png',

  // Wide menu banner — 16:9, used by all menu styles that need a header image
  menuBanner:
    'https://media.base44.com/images/public/6a6ffc9ec8a196324ba9ee95/ff8504867_generated_image.png',

  // Welcome greeting image — 16:9, warm dawn forest scene
  welcome:
    'https://media.base44.com/images/public/6a6ffc9ec8a196324ba9ee95/6e8441439_generated_image.png',

  // Goodbye greeting image — 16:9, starry night scene
  goodbye:
    'https://media.base44.com/images/public/6a6ffc9ec8a196324ba9ee95/02ebca731_generated_image.png',

  // Document thumbnail — same square logo, used for document-style cards
  docThumbnail:
    'https://media.base44.com/images/public/6a6ffc9ec8a196324ba9ee95/d1347bb68_generated_image.png',
};

export default ASSET_URLS;
