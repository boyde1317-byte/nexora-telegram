/**
 * richMediaHoist.js — guarantee that rich-message images are SEEN.
 *
 * WhatsApp's rich-response payloads reference images by URL inside a
 * base64-encoded unifiedResponse blob — the CLIENT must fetch that URL.
 * Many clients never do (redirects, hotlink policies, strict fetchers),
 * leaving an empty image slot in an otherwise perfect card (.wiki,
 * .testrich inlineimg, grid cards…).
 *
 * Fix: hoisting. After a rich card relays, decode every base64
 * unifiedResponse blob in the proto, collect the image URLs
 * (GenAIImageUXPrimitive.image_url, GenAIImaginePrimitive.media.url,
 * grid thumbnails), download + re-encode them server-side, and send each
 * as a REAL WhatsApp photo upload. The card keeps its layout; the image
 * is guaranteed to arrive.
 *
 * Fire-and-forget from the relay seams — never blocks, never throws.
 * Opt out globally with RICH_MEDIA_HOIST=0.
 */

import sharp from 'sharp';

const HOIST_ENABLED = process.env.RICH_MEDIA_HOIST !== '0';
const FETCH_TIMEOUT_MS = 10000;
const MAX_IMAGES = 6;
const MAX_DIM = 1080;
const MAX_BYTES = 420 * 1024;

/** Deep-walk a decoded unifiedResponse object collecting image URLs. */
function collectUrls(obj, out) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) { for (const v of obj) collectUrls(v, out); return; }
  const prim = obj.primitive || obj;
  const iu = prim.image_url || prim.imageUrl;
  if (iu) {
    if (iu.image_high_res_url) out.push(iu.image_high_res_url);
    if (iu.image_preview_url) out.push(iu.image_preview_url);
  }
  if (prim.media?.url) out.push(prim.media.url);
  if (prim.thumbnail_url) out.push(prim.thumbnail_url);
  if (obj.view_model) collectUrls(obj.view_model, out);
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') collectUrls(v, out);
  }
}

/** Extract image URLs from a relayed proto message (base64 blobs inside). */
export function extractProtoImageUrls(message) {
  const urls = [];
  try {
    const json = JSON.stringify(message || {});
    const blobs = json.match(/[A-Za-z0-9+/=]{80,}/g) || [];
    for (const blob of blobs) {
      try {
        const decoded = Buffer.from(blob, 'base64').toString('utf8');
        if (!decoded.startsWith('{')) continue;
        const parsed = JSON.parse(decoded);
        if (!parsed?.sections) continue;
        collectUrls(parsed.sections, urls);
      } catch { /* not a unifiedResponse blob */ }
    }
  } catch { /* never throw from extraction */ }
  return [...new Set(urls)].filter((u) => u && /^https?:\/\//.test(u));
}

/** Extract image URLs from a DECLARATIVE richResponse content object. */
export function extractDeclarativeImageUrls(content) {
  const urls = [];
  try {
    for (const sub of content?.richResponse || []) {
      if (!sub) continue;
      const img = sub.inlineImage;
      if (img) {
        const u = typeof img === 'string' ? img : (img.imageHighResUrl || img.imagePreviewUrl || img.sourceUrl);
        if (u) urls.push(u);
      }
      const grid = sub.gridImage;
      if (grid) {
        const main = typeof grid.gridImageUrl === 'string'
          ? grid.gridImageUrl
          : (grid.gridImageUrl?.imageHighResUrl || grid.gridImageUrl?.imagePreviewUrl);
        if (main) urls.push(main);
        for (const iu of grid.imageUrls || []) {
          const u = typeof iu === 'string' ? iu : (iu.imageHighResUrl || iu.imagePreviewUrl);
          if (u) urls.push(u);
        }
      }
      if (sub.dynamic?.url) urls.push(sub.dynamic.url);
    }
  } catch { /* never throw */ }
  return [...new Set(urls)].filter((u) => /^https?:\/\//.test(u));
}

/** Download + re-encode one URL into a size-capped JPEG buffer. */
async function fetchImageBuffer(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ac.signal, redirect: 'follow' });
    clearTimeout(t);
    if (!res.ok) return null;
    const raw = Buffer.from(await res.arrayBuffer());
    let buf = await sharp(raw)
      .resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    if (buf.length > MAX_BYTES) {
      buf = await sharp(buf).jpeg({ quality: 60 }).toBuffer();
    }
    return buf;
  } catch {
    clearTimeout(t);
    return null;
  }
}

/**
 * Send the extracted URLs as real photo uploads. Best-effort, capped,
 * never throws. Returns the number of photos delivered.
 */
export async function hoistImages(sock, jid, urls) {
  if (!HOIST_ENABLED || !sock?.sendMessage || !Array.isArray(urls)) return 0;
  let sent = 0;
  for (const url of urls.slice(0, MAX_IMAGES)) {
    try {
      const buf = await fetchImageBuffer(url);
      if (!buf) continue;
      await sock.sendMessage(jid, { image: buf, caption: sent === 0 ? '🖼️ _Attached for guaranteed display_' : undefined });
      sent += 1;
    } catch (err) {
      console.warn('[richMediaHoist] one image failed:', err?.message || err);
    }
  }
  return sent;
}

/** Fire-and-forget wrapper for use at the relay seams. */
export function hoistAfterRelay(sock, jid, message) {
  if (!HOIST_ENABLED) return;
  const urls = extractProtoImageUrls(message);
  if (!urls.length) return;
  hoistImages(sock, jid, urls).catch((e) =>
    console.warn('[richMediaHoist] hoist failed:', e?.message || e));
}

export default { extractProtoImageUrls, extractDeclarativeImageUrls, hoistImages, hoistAfterRelay };
