/**
 * richContent.js — Production wrappers for the remaining device-proven
 * rich primitives from richTestKit (every one of .testrich's candidates
 * now has a live consumer):
 *
 *   generateGridImageContentV2   → (reserve; grid: main + thumbnail strip)
 *   generateMultiInlineImagesV2  → .pinterest + .anime (stacked image gallery)
 *   generateDynamicContentV2     → .anime gif types (inline animated GIF)
 *   generateReelWithStatsV2      → .tiktok (native reel player + stats)
 *   generateLinkContent          → .summary (source links + citations)
 *   generateListContent          → .help (command categories list)
 *
 * Same contract as richMap.js: gate on capabilities.richResponse, relay
 * via richMap.relayGenerated (never double-set contextInfo), return
 * true on success so callers fall back to plain sends.
 */

import {
  generateGridImageContentV2,
  generateMultiInlineImagesV2,
  generateDynamicContentV2,
  generateReelWithStatsV2,
  generateLinkContent,
  generateListContent,
} from 'baileys';
import capabilities from '../core/capabilities.js';
import { relayGenerated } from './richMap.js';

async function _try(sock, jid, generated) {
  await relayGenerated(sock, jid, generated);
  return true;
}

export function richEnabled() {
  return !!capabilities.richResponse;
}

/**
 * Image grid card — one main image + thumbnail strip.
 * images: [{ preview, highRes, source }] (first becomes the main grid image).
 */
export async function sendGridCard(sock, jid, quoted, { images, headerText, footer }) {
  if (!capabilities.richResponse || !images?.length) return false;
  try {
    const [main, ...rest] = images;
    const asUrl = (i) => ({
      imagePreviewUrl: i.preview || i.highRes,
      imageHighResUrl: i.highRes || i.preview,
      sourceUrl: i.source || i.highRes || i.preview,
    });
    const generated = await generateGridImageContentV2(
      { gridImageUrl: asUrl(main), imageUrls: rest.map(asUrl).slice(0, 6) },
      quoted,
      { headerText, footer }
    );
    return await _try(sock, jid, generated);
  } catch (err) {
    console.warn('[richContent] grid card failed:', err.message);
    return false;
  }
}

/**
 * Stacked inline-image gallery.
 * images: [{ imageUrl, imageText }]
 */
export async function sendMultiImageGallery(sock, jid, quoted, { images, headerText, footer }) {
  if (!capabilities.richResponse || !images?.length) return false;
  try {
    const generated = await generateMultiInlineImagesV2(
      images.slice(0, 4).map((i) => ({ imageUrl: i.imageUrl, imageText: String(i.imageText || '').slice(0, 40) })),
      quoted,
      { primitiveStyle: 'nixcode', headerText, footer }
    );
    return await _try(sock, jid, generated);
  } catch (err) {
    console.warn('[richContent] multi-image gallery failed:', err.message);
    return false;
  }
}

/**
 * Inline animated GIF card (dynamicMetadata).
 */
export async function sendGifCard(sock, jid, quoted, { gifUrl, headerText, footer }) {
  if (!capabilities.richResponse || !gifUrl) return false;
  try {
    const generated = await generateDynamicContentV2(
      { type: 'gif', url: gifUrl, loopCount: 3, version: 1 },
      quoted,
      { primitiveStyle: 'nixcode', headerText, footer }
    );
    return await _try(sock, jid, generated);
  } catch (err) {
    console.warn('[richContent] gif card failed:', err.message);
    return false;
  }
}

/**
 * Native reel player + stats table (TikTok-style card).
 * reel: { title, profileIconUrl, thumbnailUrl, videoUrl }
 */
export async function sendReelWithStatsCard(sock, jid, quoted, { reel, tableHeaders, tableRows, headerText, footer }) {
  if (!capabilities.richResponse || !reel?.videoUrl) return false;
  try {
    const generated = await generateReelWithStatsV2(
      {
        reels: [
          {
            title: String(reel.title || 'Video').slice(0, 60),
            profileIconUrl: reel.profileIconUrl || reel.thumbnailUrl,
            thumbnailUrl: reel.thumbnailUrl,
            videoUrl: reel.videoUrl,
          },
        ],
        tableHeaders: tableHeaders || ['Metric', 'Value'],
        tableRows: (tableRows || []).slice(0, 8),
      },
      quoted,
      { headerText, footer }
    );
    return await _try(sock, jid, generated);
  } catch (err) {
    console.warn('[richContent] reel card failed:', err.message);
    return false;
  }
}

/**
 * Link card with citations (Perplexity-style source attribution).
 * links: [{ url, displayName }], citations: [{ sourceTitle, sourceQuery, citationNumber }]
 */
export async function sendLinkCard(sock, jid, quoted, { text, links, citations, footer }) {
  if (!capabilities.richResponse || !text) return false;
  try {
    const generated = await generateLinkContent(
      text.slice(0, 4000),
      (links || []).slice(0, 4),
      quoted,
      {
        footer,
        citations: (citations || []).map((c, i) => ({
          sourceTitle: c.sourceTitle,
          sourceQuery: c.sourceQuery || '',
          citationNumber: c.citationNumber || i + 1,
        })),
      }
    );
    return await _try(sock, jid, generated);
  } catch (err) {
    console.warn('[richContent] link card failed:', err.message);
    return false;
  }
}

/**
 * List card — two-column category rows.
 * rows: [[colA, colB], ...]
 */
export async function sendListCard(sock, jid, quoted, { title, rows, headerText, footer }) {
  if (!capabilities.richResponse || !rows?.length) return false;
  try {
    const generated = await generateListContent(
      String(title || 'List').slice(0, 60),
      rows.slice(0, 10).map((r) => [String(r[0]).slice(0, 60), String(r[1]).slice(0, 80)]),
      quoted,
      { headerText: headerText || title, footer }
    );
    return await _try(sock, jid, generated);
  } catch (err) {
    console.warn('[richContent] list card failed:', err.message);
    return false;
  }
}

export default {
  richEnabled,
  sendGridCard,
  sendMultiImageGallery,
  sendGifCard,
  sendReelWithStatsCard,
  sendLinkCard,
  sendListCard,
};
