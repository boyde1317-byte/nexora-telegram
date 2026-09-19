/**
 * @file src/lib/enrichContext.js
 *
 * Shared builder for the "enriched contextInfo" visual stack used across
 * all text-only bot replies.  Produces a contextInfo object containing:
 *
 *   1. newsletterAdminInviteMessage quote — gives the reply bar a
 *      "invited to channel" look instead of a bare quoted message.
 *      (Gated on config.features.newsletters — skipped silently if disabled.)
 *   2. externalAdReply — small link-preview banner with the bot logo
 *      and a source URL, rendered above the message body.
 *
 * The thumbnail is embedded directly as base64 bytes (via the `thumbnail`
 * proto field) rather than relying on `thumbnailUrl` — WhatsApp's server-side
 * fetcher is unreliable with external CDN URLs and frequently leaves a broken
 * link placeholder.  Embedding the bytes means the image renders 100% of the
 * time with no network round-trip.
 *
 * Usage:
 *   import { buildEnrichedContextInfo } from '../../lib/enrichContext.js';
 *   await m.reply(text);  // auto-attaches via serializer
 *   // or manually:
 *   const ctx = await buildEnrichedContextInfo();
 *   await sock.sendMessage(jid, { text, contextInfo: ctx }, { quoted: m });
 */

import { buildFakeNewsletterQuote } from './waUtils.js';
import { ASSET_URLS } from '../assets/assetUrls.js';
import { config } from '../../config/index.js';
import brand from '../../config/brand.js';

const DEFAULT_SOURCE_URL = 'https://github.com/boyde1317-byte/NEXORA-MD';

// ── Thumbnail cache ─────────────────────────────────────────────────────────
// Fetched once, reused for every subsequent call. Stored as a Buffer so it
// can be assigned directly to the proto `thumbnail` bytes field.
let _thumbnailBuffer = null;
let _thumbnailFetching = null;

/**
 * Fetch and cache the thumbnail image as a Buffer.
 * Called lazily on first use, or explicitly at startup via initThumbnail().
 *
 * @returns {Promise<Buffer|null>}
 */
export async function initThumbnail() {
  if (_thumbnailBuffer) return _thumbnailBuffer;
  if (_thumbnailFetching) return _thumbnailFetching;

  const url = config.adReply?.thumbnailUrl || ASSET_URLS.thumbnail;
  _thumbnailFetching = (async () => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      // Only cache if it's a reasonable size (under 500KB — WhatsApp rejects huge thumbnails)
      if (buf.length > 0 && buf.length < 500_000) {
        _thumbnailBuffer = buf;
        console.log(`[enrichContext] Thumbnail cached: ${buf.length} bytes from ${url}`);
      } else {
        console.warn(`[enrichContext] Thumbnail too large (${buf.length} bytes), skipping embed`);
      }
    } catch (err) {
      console.warn(`[enrichContext] Failed to fetch thumbnail: ${err.message}`);
    } finally {
      _thumbnailFetching = null;
    }
    return _thumbnailBuffer;
  })();

  return _thumbnailFetching;
}

/**
 * Build a contextInfo object with newsletter quote + externalAdReply.
 *
 * This function is async because it may need to fetch the thumbnail image
 * on first call (subsequent calls use the cache).
 *
 * Respects feature flags:
 *   - config.features.newsletters  → controls whether the fake newsletter quote is included
 *   - config.features.adReplyCards → controls whether the externalAdReply card is included
 *
 * If BOTH are disabled, returns an empty object (so the caller's text still sends fine).
 *
 * @param {object} [opts]
 * @param {string} [opts.newsletterName]  Newsletter display name
 * @param {string} [opts.caption]          Newsletter caption text
 * @param {string} [opts.adTitle]         Ad-reply title (default: brand.name or config.adReply.title)
 * @param {string} [opts.adBody]          Ad-reply body (default: brand.tagline or config.adReply.body)
 * @param {string} [opts.sourceUrl]       Ad-reply source URL (default: config.adReply.sourceUrl or GitHub)
 * @param {string} [opts.thumbnailUrl]    Ad-reply thumbnail image URL (used as fallback if embed fails)
 * @param {boolean}[opts.renderLargerThumbnail]  Show a larger thumbnail (default: config.adReply.renderLargerThumbnail)
 * @returns {Promise<object>} contextInfo suitable for `sock.sendMessage({ text, contextInfo })`
 */
export async function buildEnrichedContextInfo({
  newsletterName,
  caption,
  adTitle,
  adBody,
  sourceUrl,
  thumbnailUrl,
  thumbnail,
  renderLargerThumbnail,
} = {}) {
  let contextInfo = {};

  // 1. Newsletter admin invite quote (gated on feature flag)
  if (config.features?.newsletters !== false) {
    try {
      const quote = buildFakeNewsletterQuote({
        newsletterName: newsletterName || `${brand.name} Updates`,
        caption:        caption || brand.tagline || `Made with \u2665\uFE0F By ${brand.creator}`,
      });
      contextInfo = {
        stanzaId:      quote.key.id,
        participant:    quote.key.participant,
        remoteJid:      quote.key.remoteJid,
        quotedMessage:  quote.message,
      };
    } catch (_) {
      // fall through — externalAdReply still works without a quote
    }
  }

  // 2. externalAdReply thumbnail banner (gated on feature flag)
  if (config.features?.adReplyCards !== false) {
    const adConfig = config.adReply || {};
    const finalThumbnailUrl = thumbnailUrl || adConfig.thumbnailUrl || ASSET_URLS.thumbnail;

    // Ensure thumbnail is cached (first call fetches, subsequent calls are instant)
    if (!_thumbnailBuffer) {
      await initThumbnail();
    }

    const adReply = {
      title:                  adTitle  || adConfig.title  || brand.name,
      body:                   adBody   || adConfig.body   || brand.tagline || `By ${brand.creator}`,
      sourceUrl:              sourceUrl || adConfig.sourceUrl || DEFAULT_SOURCE_URL,
      mediaType:              1,
      renderLargerThumbnail:  renderLargerThumbnail ?? adConfig.renderLargerThumbnail ?? false,
      showAdAttribution:      false,
    };

    // Embed the thumbnail as raw bytes — WhatsApp renders this directly
    // without needing to fetch a URL (which frequently fails and leaves a
    // broken link placeholder).  Keep thumbnailUrl as a fallback pointer.
    // A per-call `thumbnail` buffer (e.g. a user's profile picture for
    // .me/.userinfo) takes priority over the cached default logo.
    const thumbBuf = thumbnail || _thumbnailBuffer;
    if (thumbBuf) {
      adReply.thumbnail = thumbBuf;
      // Still include thumbnailUrl so the card has a clickable link target
      adReply.thumbnailUrl = finalThumbnailUrl;
    } else {
      // No cached buffer — fall back to URL only (may not render on some clients)
      adReply.thumbnailUrl = finalThumbnailUrl;
    }

    contextInfo.externalAdReply = adReply;
  }

  return contextInfo;
}

export default buildEnrichedContextInfo;
