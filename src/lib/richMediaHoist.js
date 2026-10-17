/**
 * richMediaHoist.js — guarantee that rich-message images are SEEN.
 *
 * WhatsApp's rich-response payloads reference images by URL inside a
 * base64-encoded unifiedResponse blob — the CLIENT must fetch that URL.
 * Many clients never do (redirects, hotlink policies, strict fetchers),
 * leaving an empty image slot in an otherwise perfect card (.wiki,
 * .testrich inlineimg, grid cards…).
 *
 * Fix (primary): rehosting. BEFORE a rich card relays, collect every
 * image URL (submessage metadata + decoded unifiedResponse blobs),
 * download server-side, upload to WhatsApp's own media CDN
 * (sock.waUploadToServer), and rewrite the card to point at the hosted
 * URL. WA media URLs are exactly what real Meta AI imagine cards carry,
 * so the on-device client paints them reliably.
 *
 * Fix (fallback): hoisting. After a rich card relays, send the images as
 * REAL WhatsApp photo uploads so the image is guaranteed to arrive even
 * when rehosting was unavailable.
 *
 * Fire-and-forget from the relay seams — never blocks, never throws.
 * Opt out globally with RICH_MEDIA_HOIST=0 or REHOST_RICH_MEDIA=0.
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

// ── Rich-card image rehosting (primary fix) ──────────────────────────────

const REHOST_ENABLED = process.env.REHOST_RICH_MEDIA !== '0';
const REHOST_FETCH_TIMEOUT_MS = 15000;
const REHOST_MAX_IMAGES = 8;

// leaf keys that carry image URLs (never citation/text links)
const IMAGE_FIELD_KEYS = new Set([
  'imagePreviewUrl', 'imageHighResUrl', 'thumbnailUrl', 'thumbnail_url', 'url',
]);
// parent/grandparent keys that mark a leaf as image context (media.url,
// dynamic.url, gridImageMetadata.*, imageMetadata.imageUrl.*, imageUrls[].*)
const IMAGE_CONTEXT_KEYS = new Set([
  'media', 'dynamic', 'gridImageUrl', 'imageUrl', 'image_url', 'imageUrls',
  'imageMetadata', 'gridImageMetadata', 'thumbnails',
]);

function isRehostableUrl(u) {
  return typeof u === 'string' && /^https?:\/\//.test(u) && !/\.whatsapp\.net\//.test(u);
}

function isBase64Blob(v) {
  return typeof v === 'string' && v.length >= 80 && /^[A-Za-z0-9+/=]+$/.test(v);
}

/** decode base64 → parsed unifiedResponse JSON, or null */
function decodeBlob(v) {
  try {
    const decoded = Buffer.from(v, 'base64').toString('utf8');
    if (!decoded.startsWith('{')) return null;
    const parsed = JSON.parse(decoded);
    return parsed?.sections ? parsed : null;
  } catch { return null; }
}

/**
 * Deep-walk a generated proto object finding rehostable image URLs and every
 * unifiedResponse blob. Citation/source text links are never collected.
 */
function collectRichMedia(node, parentKey = '', grandparentKey = '', out = { urls: new Set(), blobs: new Set() }) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const v of node) collectRichMedia(v, parentKey, grandparentKey, out);
    return out;
  }
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === 'string') {
      if (isBase64Blob(v)) {
        const parsed = decodeBlob(v);
        if (parsed) {
          out.blobs.add({ node, key: k, parsed });
          const urls = [];
          collectUrls(parsed.sections, urls);
          for (const u of urls) if (isRehostableUrl(u)) out.urls.add(u);
          continue;
        }
      }
      const inImageContext = IMAGE_CONTEXT_KEYS.has(parentKey) || IMAGE_CONTEXT_KEYS.has(grandparentKey)
        || IMAGE_FIELD_KEYS.has(parentKey) || parentKey.endsWith('Metadata');
      if (isRehostableUrl(v) && inImageContext
        && (IMAGE_FIELD_KEYS.has(k) || Number.isInteger(Number(k)) && !Number.isNaN(Number(k)) && IMAGE_CONTEXT_KEYS.has(parentKey))) {
        out.urls.add(v);
      }
    } else if (v && typeof v === 'object') {
      collectRichMedia(v, k, parentKey, out);
    }
  }
  return out;
}

/** Rewrite mapped URLs inside a decoded unifiedResponse; sync media.mime_type. */
function rewriteDecoded(node, urlMap, byNewUrl) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((v) => rewriteDecoded(v, urlMap, byNewUrl)); return; }
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === 'string') {
      const hosted = urlMap.get(v);
      if (hosted) node[k] = hosted.url;
    } else if (v && typeof v === 'object') {
      rewriteDecoded(v, urlMap, byNewUrl);
    }
  }
  // node IS a media object: keep mime_type true to the rehosted bytes
  if (typeof node.url === 'string' && typeof node.mime_type === 'string') {
    const hosted = byNewUrl.get(node.url);
    if (hosted) node.mime_type = hosted.mime;
  }
}

/** Deep-walk the proto replacing mapped plain-field URLs. */
function rewritePlain(node, urlMap) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((v) => rewritePlain(v, urlMap)); return; }
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === 'string') {
      const hosted = urlMap.get(v);
      if (hosted) node[k] = hosted.url;
    } else if (v && typeof v === 'object') {
      rewritePlain(v, urlMap);
    }
  }
}

/** Download one URL, upload ORIGINAL bytes to WhatsApp's CDN. @returns {{url,mime}|null} */
async function rehostUrl(sock, url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(REHOST_FETCH_TIMEOUT_MS), redirect: 'follow' });
    if (!res.ok) throw new Error('fetch ' + res.status);
    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.length) throw new Error('empty body');
    const mime = (res.headers.get('content-type') || '').split(';')[0].trim();
    if (!/^image\//.test(mime)) throw new Error('not an image: ' + mime);
    const up = await sock.waUploadToServer(buffer, { mimetype: mime, filename: 'rich.' + (mime.split('/')[1] || 'jpg') });
    const hosted = up?.mediaUrl || up?.url || (up?.directPath ? 'https://mmg.whatsapp.net' + up.directPath : null);
    if (!hosted) throw new Error('no upload url: ' + Object.keys(up || {}).join(','));
    return { url: hosted, mime };
  } catch (e) {
    console.warn('[richMediaRehost] kept original URL (' + (e?.message || e) + '):', url);
    return null;
  }
}

/**
 * Rehost every rich-card image URL onto WhatsApp's media CDN, in place.
 * Mutates `message` (the generated proto object). Never throws.
 * @returns {Promise<number>} how many URLs were rehosted.
 */
export async function rehostRichCardMedia(sock, message) {
  if (!REHOST_ENABLED || !sock?.waUploadToServer || !message) return 0;
  try {
    const found = collectRichMedia(message);
    const urls = [...found.urls].slice(0, REHOST_MAX_IMAGES);
    if (!urls.length) return 0;
    const results = await Promise.all(urls.map((u) => rehostUrl(sock, u)));
    const urlMap = new Map();
    urls.forEach((u, i) => { if (results[i]) urlMap.set(u, results[i]); });
    if (!urlMap.size) return 0;
    const byNewUrl = new Map([...urlMap.values()].map((h) => [h.url, h]));
    for (const blob of found.blobs) {
      const before = JSON.stringify(blob.parsed);
      rewriteDecoded(blob.parsed, urlMap, byNewUrl);
      if (JSON.stringify(blob.parsed) !== before) {
        blob.node[blob.key] = Buffer.from(JSON.stringify(blob.parsed), 'utf8').toString('base64');
      }
    }
    rewritePlain(message, urlMap);
    console.log(`[richMediaRehost] moved ${urlMap.size}/${urls.length} card image(s) onto WhatsApp CDN`);
    return urlMap.size;
  } catch (e) {
    console.warn('[richMediaRehost] skipped:', e?.message || e);
    return 0;
  }
}

export default { extractProtoImageUrls, extractDeclarativeImageUrls, hoistImages, hoistAfterRelay, rehostRichCardMedia };
