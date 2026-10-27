/**
 * @file src/lib/codePull.js
 *
 * Pull a whole codebase from a link — the "heavy" counterpart of .get:
 * .get fetches a page's HTML, this fetches files and archives.
 *
 * Supported sources:
 *   - MediaFire /file/ pages  (scrapes the dkey → direct link chain)
 *   - GitHub repo URLs        (owner/repo → HEAD zipball via codeload)
 *   - Direct .zip / .tar.gz   (any host)
 *   - Any single file URL     (js/json/txt/... → sent back as a document)
 *
 * Everything is kept IN MEMORY (no zip-slip risk, no temp dirs to clean):
 * archives are unpacked to a Map<virtualPath, Uint8Array> with hard caps
 * on download size, extracted total, and file count.
 *
 * Results are cached for 10 minutes keyed by URL so the follow-up
 * `.code <url> <path>` doesn't re-download the archive.
 */

import { unzipSync, gunzipSync } from 'fflate';
import crypto from 'crypto';

/* ── Limits ──────────────────────────────────────────────────────────── */
export const PULL_LIMITS = {
  maxDownloadMB: 25,   // archive fetch cap
  maxExtractedMB: 80,  // total unpacked bytes cap
  maxFiles: 3000,      // file count cap
  cacheTTLms: 10 * 60 * 1000,
  cacheEntries: 4,
};

const UA = 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/120 Mobile';

const PRIVATE_HOST_RE =
  /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|::1|\[::1\]|172\.(1[6-9]|2\d|3[01])\.)/i;

/* ── URL normalization & classification ─────────────────────────────── */

export function normalizeSource(raw) {
  if (!raw) return null;
  let url = raw.trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (PRIVATE_HOST_RE.test(u.hostname)) return null;
  return u;
}

/**
 * Classify a source URL → { kind, effectiveUrl, name }
 *   kind: mediafire | github-repo | archive | file
 */
export async function classifySource(u) {
  const href = u.toString();

  if (/mediafire\.com\/file\//i.test(u.hostname + u.pathname)) {
    return { kind: 'mediafire', effectiveUrl: href, name: decodeURIComponent(u.pathname.split('/')[2] || 'mediafire') };
  }

  // GitHub repo (not a raw/archive URL): resolve to the default-branch zipball
  const gh = u.hostname === 'github.com' && href.match(/^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)(\/|$)/i);
  if (gh && !/\/(archive|releases?|raw|blob)\b/i.test(u.pathname)) {
    const [, owner, repo] = gh;
    const zipUrl = `https://github.com/${owner}/${repo}/archive/HEAD.zip`;
    return { kind: 'github-repo', effectiveUrl: zipUrl, name: `${owner}-${repo}` };
  }

  const path = u.pathname.toLowerCase();
  if (path.endsWith('.zip') || path.endsWith('.tar.gz') || path.endsWith('.tgz')) {
    return { kind: 'archive', effectiveUrl: href, name: decodeURIComponent(u.pathname.split('/').pop() || 'archive') };
  }

  return { kind: 'file', effectiveUrl: href, name: decodeURIComponent(u.pathname.split('/').pop() || 'file') };
}

/* ── MediaFire dkey chain (ported from the analyze skill's fetch.py) ── */

async function mediafireDirect(pageUrl) {
  const page = await fetchText(pageUrl);
  let m = page.match(/href="\/\/www\.mediafire\.com\/file\/[^"]*dkey=[^"]*"/);
  let page2 = page;
  if (m) {
    const dkeyUrl = m[0].replace('href="', 'https://').replace(/&amp;/g, '&');
    page2 = await fetchText(dkeyUrl, pageUrl);
  }
  const dm = page2.match(/https?:\/\/download\d+\.mediafire\.com\/[^"'\s\\]+/);
  if (!dm) throw new Error('Could not resolve a direct download link from MediaFire.');
  return dm[0].replace(/&amp;/g, '&');
}

async function fetchText(url, referer) {
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(20000),
    headers: { 'User-Agent': UA, ...(referer ? { Referer: referer } : {}) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${new URL(url).hostname}`);
  return (await res.text()).slice(0, 2_000_000);
}

/* ── Byte-capped download ────────────────────────────────────────────── */

async function downloadBytes(url, referer, capMB = PULL_LIMITS.maxDownloadMB) {
  const cap = capMB * 1024 * 1024;
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(90000),
    headers: { 'User-Agent': UA, ...(referer ? { Referer: referer } : {}) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) throw new Error('Empty download.');
  if (buf.length > cap) throw new Error(`Too big: ${buf.length} bytes (cap ${cap}).`);
  return buf;
}

/* ── tar (uncompressed) — minimal reader for files/dirs only ─────────── */

function untar(buf) {
  const files = new Map();
  let off = 0, longName = null;
  while (off + 512 <= buf.length) {
    const header = buf.subarray(off, off + 512);
    let name = longName || header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    longName = null;
    const sizeStr = header.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim();
    const size = parseInt(sizeStr, 8) || 0;
    const type = String.fromCharCode(header[100] || 0x30);
    off += 512;
    const data = buf.subarray(off, off + size);
    off += Math.ceil(size / 512) * 512;
    if (!name || name === './') continue;
    if (type === 'L') { longName = data.toString('utf8').replace(/\0.*$/, ''); continue; }
    if (type === 'x' || type === 'g') continue;         // pax headers
    if (type === '0' || type === '\0') files.set(name, new Uint8Array(data));
  }
  return files;
}

/* ── Archive → Map<virtualPath, Uint8Array> with caps & sanitizing ───── */

function safeEntry(name) {
  if (!name || name.startsWith('/') || name.includes('..') || name.includes('\\')) return null;
  if (name.endsWith('/')) return null;          // directory marker, not a file
  if (/(^|\/)__MACOSX\//i.test(name) || /(^|\/)\.DS_Store$/i.test(name)) return null;
  return name.replace(/\/+$/, '');
}

function unpack(buf, name) {
  let files;
  if (/\.(tgz|tar\.gz)$/i.test(name)) {
    files = untar(gunzipSync(new Uint8Array(buf)));
  } else {
    files = new Map(Object.entries(unzipSync(new Uint8Array(buf))));
  }
  const out = new Map();
  let total = 0;
  for (const [raw, data] of files) {
    if (out.size >= PULL_LIMITS.maxFiles) break;
    const clean = safeEntry(raw);
    if (!clean) continue;
    total += data.length;
    if (total > PULL_LIMITS.maxExtractedMB * 1024 * 1024) {
      throw new Error('Archive too large after unpacking (over 80MB).');
    }
    out.set(clean, data);
  }
  if (!out.size) throw new Error('No usable files inside the archive.');
  // strip a single common top-level dir so paths read like <repo>/src/...
  const firstSegs = new Set([...out.keys()].map((k) => k.split('/')[0]));
  if (firstSegs.size === 1) {
    const strip = [...firstSegs][0];
    const stripped = new Map();
    for (const [k, v] of out) stripped.set(k.slice(strip.length + 1) || k, v);
    return stripped;
  }
  return out;
}

/* ── Cache (URL → codebase, TTL 10 min) ──────────────────────────────── */

const cache = new Map(); // key → { expires, codebase }

const cacheKey = (url) => crypto.createHash('sha1').update(url).digest('hex').slice(0, 12);

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) { cache.delete(key); return null; }
  return hit.codebase;
}

function cachePut(key, codebase) {
  cache.set(key, { expires: Date.now() + PULL_LIMITS.cacheTTLms, codebase });
  while (cache.size > PULL_LIMITS.cacheEntries) cache.delete(cache.keys().next().value);
}

/* ── Main entry ──────────────────────────────────────────────────────── */

/**
 * Pull a codebase from a link.
 * @param {string} rawUrl
 * @returns {Promise<{kind:'archive', name, files:Map, totalBytes:number, fromCache:boolean}|
 *                 {kind:'file', name, buf:Buffer, fromCache:boolean}>}
 */
export async function pullCode(rawUrl) {
  const u = normalizeSource(rawUrl);
  if (!u) throw new Error('Invalid or blocked URL.');

  const key = cacheKey(u.toString());
  const cached = cacheGet(key);
  if (cached) return { ...cached, fromCache: true };

  const src = await classifySource(u);
  let codebase;

  if (src.kind === 'mediafire') {
    const direct = await mediafireDirect(u.toString());
    const buf = await downloadBytes(direct, u.toString());
    codebase = /\.(zip|tar\.gz|tgz)$/i.test(direct.split('?')[0])
      ? { kind: 'archive', name: src.name, files: unpack(buf, src.name), }
      : { kind: 'file', name: src.name, buf };
  } else if (src.kind === 'github-repo' || src.kind === 'archive') {
    const buf = await downloadBytes(src.effectiveUrl);
    codebase = { kind: 'archive', name: src.name, files: unpack(buf, src.name) };
  } else {
    const buf = await downloadBytes(src.effectiveUrl, null, 10);
    codebase = { kind: 'file', name: src.name, buf };
  }

  if (codebase.kind === 'archive') {
    codebase.totalBytes = [...codebase.files.values()].reduce((a, v) => a + v.length, 0);
  }
  cachePut(key, codebase);
  return { ...codebase, fromCache: false };
}

/**
 * Find a file inside a pulled archive: exact path, else unique case-insensitive
 * substring match. Returns [path, data] or null.
 */
export function findInCodebase(files, wanted) {
  const q = wanted.trim().replace(/^\.?\//, '');
  if (files.has(q)) return [q, files.get(q)];
  const lower = q.toLowerCase();
  const candidates = [...files.keys()].filter((k) => k.toLowerCase().includes(lower));
  if (candidates.length === 1) return [candidates[0], files.get(candidates[0])];
  // prefer shortest path when several match
  candidates.sort((a, b) => a.length - b.length);
  if (candidates.length > 1) return [candidates[0], files.get(candidates[0]), candidates];
  return null;
}
