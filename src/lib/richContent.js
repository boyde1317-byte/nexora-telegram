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
  generateLatexContentV2,
  generateLatexImageContentV2,
} from 'baileys';
import crypto from 'crypto';
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
    // Ship the video OFF TikTok's CDN first — see rehostReelVideo.
    const videoUrl = await rehostReelVideo(sock, reel.videoUrl);
    const generated = await generateReelWithStatsV2(
      {
        reels: [
          {
            title: String(reel.title || 'Video').slice(0, 60),
            profileIconUrl: reel.profileIconUrl || reel.thumbnailUrl,
            thumbnailUrl: reel.thumbnailUrl,
            videoUrl,
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

// ── LaTeX ────────────────────────────────────────────────────────────────────
// codecogs runs REAL LaTeX (incl. \begin{tabular}) — the local mathjax
// renderer cannot parse text environments, so codecogs is the fallback.
const _codecogsUrl = (expr) =>
  'https://latex.codecogs.com/png.image?\\dpi{150}%20' + encodeURIComponent(expr);

// Fetch a codecogs PNG once to read its true pixel size (PNG IHDR) so the
// GenAILatexItem entity paints it undistorted — tabulars render much wider
// and taller than formulas, and a fixed 320x60 squashes them.
async function _codecogsDims(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 24 || buf.slice(12, 16).toString('hex') !== '49484452') return null;
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
    const scale = w > 640 ? 640 / w : 1;
    return { width: Math.round(w * scale), height: Math.round(h * scale) };
  } catch (_) { return null; }
}

/**
 * Reel videos must point at WhatsApp's own media CDN: the on-device reel
 * player streams video_url itself, and clients do NOT fetch media from
 * arbitrary third-party hosts inside rich cards (device-verified — the
 * same rule that forced image rehosting; see richMediaHoist.js). Meta's
 * real reels point at WA media, so we upload the video bytes there first.
 * @returns the (possibly rehosted) URL — never throws.
 */
async function rehostReelVideo(sock, videoUrl) {
  if (!videoUrl || !/^https?:\/\//.test(videoUrl)) return videoUrl;
  if (/mmg\.whatsapp\.net|media\.whatsapp\.net/.test(videoUrl)) return videoUrl; // already WA CDN
  const uploadFn = sock?.waUploadToServer;
  if (!uploadFn) return videoUrl;
  try {
    const res = await fetch(videoUrl, { signal: AbortSignal.timeout(120000), redirect: 'follow' });
    if (!res.ok) throw new Error('fetch ' + res.status);
    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.length) throw new Error('empty body');
    if (buffer.length > 80 * 1024 * 1024) throw new Error('too large to rehost');
    // waUploadToServer's real contract: { mediaType, fileEncSha256B64, timeoutMs }
    // (NOT mimetype/filename — that variant dies at .replace() and the card
    // silently keeps the dying third-party URL). We upload PLAIN bytes with
    // their own sha256 as the token — rich-card media URLs are fetched and
    // played directly by the client (Meta's own GenAI media works the same).
    const fileEncSha256B64 = crypto.createHash('sha256').update(buffer).digest('base64');
    const up = await uploadFn(buffer, { mediaType: 'video', fileEncSha256B64, timeoutMs: 120000 });
    const hosted = up?.mediaUrl || up?.url || (up?.directPath ? 'https://mmg.whatsapp.net' + up.directPath : null);
    if (!hosted) throw new Error('upload returned no url');
    console.log('[richContent] reel video rehosted to WhatsApp CDN (' + Math.round(buffer.length / 1024) + ' KB)');
    return hosted;
  } catch (e) {
    console.warn('[richContent] reel video rehost failed, keeping original URL (' + (e?.message || e) + ')');
    return videoUrl;
  }
}

/**
 * Typeset LaTeX card — expressions rendered as images on a native rich
 * card (the .testrich v2lateximg anatomy). Backend order:
 *   1. local mathjax-node + sharp renderer (pure math, in-process)
 *   2. codecogs pre-rendered PNGs (full LaTeX incl. tabular)
 * Returns true when a card went out; false otherwise (caller falls back).
 */
export async function sendLatexCard(sock, jid, quoted, { text, expressions, headerText, footer }) {
  if (!capabilities.richResponse || !expressions?.length) return false;
  const items = expressions.slice(0, 4).map((e) =>
    typeof e === 'string' ? { latexExpression: e } : e);
  try {
    const uploadFn = sock?.waUploadToServer || sock?.uploadToServer;
    if (uploadFn) {
      try {
        let renderFn;
        try { renderFn = (await import('./latexRenderer.js')).default; } catch (_) { /* no local renderer (standalone build) */ }
        const generated = await generateLatexImageContentV2(
          quoted,
          { text: text || 'Typeset LaTeX:', expressions: items, headerText, footer },
          uploadFn,
          renderFn
        );
        return await _try(sock, jid, generated);
      } catch (err) {
        // mathjax can't parse text environments (tabular etc.) — codecogs can
        console.warn('[richContent] local latex render failed, codecogs fallback:', err.message);
      }
    }
    const exprs = await Promise.all(items.map(async (it) => {
      const tex = it.latexExpression || it.latex || '';
      const url = _codecogsUrl(tex);
      const dims = await _codecogsDims(url);
      return { latexExpression: tex, url, width: dims?.width || 320, height: dims?.height || 60 };
    }));
    const generated = generateLatexContentV2(quoted, {
      text: text || 'Typeset LaTeX:',
      expressions: exprs,
      headerText, footer,
    });
    return await _try(sock, jid, generated);
  } catch (err) {
    console.warn('[richContent] latex card failed:', err.message);
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
