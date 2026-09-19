/**
 * @file src/lib/downloader.js
 * Thin, transparent fetch wrappers around live scraper/downloader endpoints.
 *
 * Design choice: rather than pulling in a third-party npm scraper package
 * (several on npm ship obfuscated code or dead endpoints), we call the same
 * backend those packages wrap directly with native `fetch`, matching the
 * rest of the codebase's HTTP convention (see ssweb.js).
 *
 * Resilience: the downloader tries multiple backend hosts in order — if the
 * primary is down, it automatically falls through to the fallback before
 * surfacing the error to the caller.
 *
 * All functions:
 *  - throw a plain Error with a human-readable message on failure (never
 *    silently return null/undefined on error — callers decide how to present it)
 *  - apply a request timeout via AbortSignal
 *  - return plain JS objects/arrays, already unwrapped from each endpoint's
 *    particular response envelope
 */

// ── Backend endpoints ─────────────────────────────────────────────────────────
// Primary + fallback backends for download commands. If the primary goes down,
// we automatically retry on the fallback before surfacing the error.
// api.tioo.eu.org was REMOVED 2026-09-15: it stopped responding entirely
// (every request times out), so it only added ~20s of dead wait to every
// retry cycle. backend2/3/4 verified live (ttdl + fbdown both answer).
const BACKENDS = [
  'https://backend1.tioo.eu.org',
  'https://backend2.tioo.eu.org',
  'https://backend3.tioo.eu.org',
  'https://backend4.tioo.eu.org',
];
const DEFAULT_TIMEOUT = 20000;

/**
 * getJson2 — plain JSON fetch with a semantic validator and timeout.
 * Used for non-tioo endpoints (loader.to) that need no host failover.
 */
async function getJson2(path, validate) {
  const res = await fetch(path, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (validate && !validate(json)) throw new Error('unexpected response shape');
  return json;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** True if the given text looks like a public http(s) URL. */
export const isUrl = (s) => {
  const trimmed = (s || '').trim();
  if (!/^https?:\/\/.{3,}/i.test(trimmed)) return false;
  // Block private/internal IPs to prevent SSRF
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' || host.endsWith('.local') ||
      host === '169.254.169.254' || host === '0.0.0.0' ||
      /^127\./.test(host) || /^10\./.test(host) ||
      /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return false;
    }
  } catch (_) { return false; }
  return true;
};

/**
 * getJson — fetch a downloader-API route with host failover.
 *
 * opts.validate: optional semantic validator. A 200 JSON body can still be
 * a "dead" extraction — e.g. Facebook rate-limits repeat scrapes of the
 * same URL and the backend answers { status: true, Normal_video: null }.
 * Without the validator that empty result was returned as success and the
 * caller threw a dead-end error while other hosts could still have the
 * cached extraction. validate(body) → false now counts as a backend
 * failure so the loop walks to the next host before giving up.
 */
async function getJson(path, { timeout = DEFAULT_TIMEOUT, validate } = {}) {
  const MAX_RETRIES = 2;  // try each backend up to 2 times (2 × hosts attempts)
  const RETRY_DELAY = 1500;  // ms between retries
  let lastError;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    for (const base of BACKENDS) {
      try {
        const res = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(timeout) });
        if (!res.ok) throw new Error(`Backend returned HTTP ${res.status}.`);
        const ct = res.headers.get('content-type') ?? '';
        if (!ct.includes('json')) throw new Error('Non-JSON response — the link may be invalid or unsupported.');
        const body = await res.json();
        if (validate && !validate(body)) {
          throw new Error('Backend returned an empty extraction result.');
        }
        return body;
      } catch (err) {
        lastError = err;
        // Try next backend immediately, then retry cycle after delay
      }
    }
    // All backends failed this attempt — wait before retrying
    if (attempt < MAX_RETRIES - 1) {
      await new Promise(r => setTimeout(r, RETRY_DELAY));
    }
  }
  throw new Error(`Download failed after ${MAX_RETRIES} attempts. The backend may be temporarily unavailable — try again in a moment.`);
}

/** YouTube search (used by .play / .ytmp4 without a direct URL). */
export async function youtubeSearch(query) {
  const data = await getJson(`/yts?url=${encodeURIComponent(query)}`);
  const list = data?.all || data?.result || [];
  if (!Array.isArray(list) || list.length === 0) throw new Error('No YouTube results found for that search.');
  return list.map(v => ({
    videoId: v.videoId,
    url: v.url || (v.videoId ? `https://youtube.com/watch?v=${v.videoId}` : undefined),
    title: v.title,
    thumbnail: v.thumbnail,
    // yt-search returns duration as {seconds, timestamp} — surface the
    // display string ("3:16"), never the raw object ([object Object]
    // leaked into every .play/.ytmp4 picker row + card header).
    duration: v.duration?.timestamp || v.duration || v.timestamp,
    views: v.views,
    author: v.author?.name || v.author,
  })).filter(v => v.url);
}

/**
 * YouTube video → direct mp3 + mp4 links, by URL.
 *
 * The tioo /youtube route started returning a bare {status:true} with no
 * links at all (YouTube extraction dead across all four tioo hosts since
 * ~2026-09-19 — every .play/.ytmp3 "No audio stream available"). A 200
 * with status:true looked "successful" to the failover loop, so it never
 * tried anything else. Now we treat empty-link responses as failures and
 * fall through to loader.to's two-step API:
 *   1. GET /ajax/download.php?format=mp3&url=… → {id, progress_url}
 *   2. poll progress_url every 2s (up to ~40s) → {success, download_url}
 * loader.to links are short-lived, same as the old ymcdn tokens — callers
 * already buffer immediately, which is why we kept that contract.
 */
export async function youtubeDownload(url, { preferMp4 = false } = {}) {
  // ── Primary: tioo family (works again if their extractor recovers) ──
  try {
    const data = await getJson(`/youtube?url=${encodeURIComponent(url)}`);
    // A 200/status:true body with NO links is the new dead-extractor
    // shape — count it as a failure instead of a success.
    const alive = data?.status && (data.mp3 || data.mp4);
    if (alive) {
      return {
        title: data.title,
        author: data.author,
        thumbnail: data.thumbnail,
        mp4: data.mp4,
        mp3: data.mp3,
      };
    }
  } catch (_) { /* primary down/empty — fall through to loader.to */ }

  // ── Fallback: loader.to two-step ──────────────────────────────────
  const viaLoader = await loaderToDownload(url, preferMp4 ? '360' : 'mp3');
  if (!viaLoader) {
    throw new Error('Could not fetch that YouTube video. Check the link and try again.');
  }
  return viaLoader;
}

/**
 * loader.to two-step download. Returns the same shape as the tioo route
 * (mp3 in .mp3, video in .mp4) or null when the job never produced a URL.
 */
async function loaderToDownload(url, format) {
  const start = await getJson2(
    `https://loader.to/ajax/download.php?format=${format}&url=${encodeURIComponent(url)}`,
    (j) => !!(j?.success && j?.progress_url),
  ).catch(() => null);
  if (!start) return null;

  // Poll the progress endpoint until the download URL appears.
  for (let i = 0; i < 20; i++) {
    await sleep(2000);
    const p = await getJson2(start.progress_url, (j) => j && typeof j === 'object')
      .catch(() => null);
    if (p?.success === 1 && p?.download_url) {
      return {
        title: null,
        author: null,
        thumbnail: null,
        mp3: format === 'mp3' ? p.download_url : undefined,
        mp4: format !== 'mp3' ? p.download_url : undefined,
      };
    }
  }
  return null;
}

/** TikTok video → direct (no-watermark) video/audio links. */
export async function tiktokDownload(url) {
  const data = await getJson(`/ttdl?url=${encodeURIComponent(url)}`, {
    validate: (j) => !!((j?.status || j?.video) && (j.video?.length || j.audio?.length)),
  });
  const videos = data.video || [];
  const audios = data.audio || [];
  if (videos.length === 0) throw new Error('TikTok returned no downloadable video for that link — it may have been removed or is private.');
  return {
    title: data.title,
    // `creator` is the uploader's actual username. `title_audio` is NOT an
    // author field at all — it's the sound/music track title (usually just
    // the video's caption + " (audio)"), so it was showing the same long
    // caption text (truncated mid-word) as the "Author" on every card.
    author: data.creator || data.author_name || data.username || data.nickname || null,
    thumbnail: data.thumbnail,
    video: videos[0],
    audio: audios[0],
  };
}

/** Instagram post/reel/story → direct media links. */
export async function instagramDownload(url) {
  const data = await getJson(`/igdl?url=${encodeURIComponent(url)}`);
  const list = Array.isArray(data) ? data : (data?.data || []);
  if (!list.length) throw new Error('Could not fetch that Instagram link. It may be private or invalid.');
  return list.map(item => ({
    thumbnail: item.thumbnail,
    url: item.url,
    resolution: item.resolution,
  })).filter(i => i.url);
}

/** Facebook video → direct (SD + HD) links. */
export async function facebookDownload(url) {
  // Facebook rate-limits repeat scrapes of the same URL — extraction
  // intermittently comes back with status:true but null links. The
  // validator makes those count as failures so the host-failover loop
  // can pick up a cached extraction from a different backend.
  const data = await getJson(`/fbdown?url=${encodeURIComponent(url)}`, {
    validate: (j) => !!(j?.status && (j.Normal_video || j.HD || j.Hd_video)),
  }).catch((err) => {
    if (String(err.message).includes('empty extraction')) {
      throw new Error('Facebook returned no video for that link — it may be private, deleted, or rate-limited. Try again in a moment.');
    }
    throw err;
  });
  return {
    sd: data.Normal_video,
    hd: data.HD || data.Hd_video,
  };
}

/** Twitter/X post → direct video/media links. */
export async function twitterDownload(url) {
  const data = await getJson(`/twitter?url=${encodeURIComponent(url)}`);
  const links = (data?.url || []).filter(u => u && (u.hd || u.sd || u.url));
  if (!data?.status || links.length === 0) throw new Error('Could not fetch media from that X/Twitter post. It may not contain a video, or the link is invalid.');
  const best = links[links.length - 1];
  return {
    title: data.title,
    url: best.hd || best.sd || best.url,
  };
}

/** Spotify track → direct mp3 download link. */
export async function spotifyDownload(url) {
  const data = await getJson(`/spotify?url=${encodeURIComponent(url)}`);
  const res = data?.res_data;
  const format = res?.formats?.[0];
  if (!data?.status || !format?.url) throw new Error('Could not fetch that Spotify track. Check the link and try again.');
  return {
    title: res.title,
    thumbnail: res.thumbnail,
    duration: res.duration,
    url: format.url,
  };
}

/** Pinterest search (by query) → list of pin images. */
export async function pinterestSearch(query) {
  const data = await getJson(`/pinterest?url=${encodeURIComponent(query)}`);
  const list = data?.result?.result || [];
  if (!data?.success || list.length === 0) throw new Error('No Pinterest results found for that search.');
  return list.map(p => ({
    title: p.title,
    image: p.image_url,
    pinUrl: p.pin_url,
  })).filter(p => p.image);
}

/** APK search via Aptoide's public catalog search. */
export async function apkSearch(query) {
  const res = await fetch(
    `https://ws75.aptoide.com/api/7/apps/search/query=${encodeURIComponent(query)}/limit=8`,
    { signal: AbortSignal.timeout(DEFAULT_TIMEOUT) },
  );
  if (!res.ok) throw new Error(`APK catalog returned HTTP ${res.status}.`);
  const data = await res.json();
  const list = data?.datalist?.list || [];
  if (list.length === 0) throw new Error('No APKs found for that search.');
  return list.map(a => ({
    name: a.name,
    packageName: a.package,
    version: a.file?.vername,
    size: a.size,
    icon: a.icon,
    downloads: a.stats?.downloads,
    rating: a.stats?.rating?.avg,
    url: a.file?.path || a.file?.path_alt,
  })).filter(a => a.url);
}

/** General web "quick facts" search via DuckDuckGo's official Instant Answer API (no key). */
export async function webSearch(query) {
  const res = await fetch(
    `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
    { signal: AbortSignal.timeout(DEFAULT_TIMEOUT) },
  );
  if (!res.ok) throw new Error(`Search backend returned HTTP ${res.status}.`);
  const data = await res.json();
  const related = (data.RelatedTopics || [])
    .flatMap(t => t.Topics ? t.Topics : [t])
    .filter(t => t.Text)
    .slice(0, 5)
    .map(t => ({ text: t.Text, url: t.FirstURL }));

  if (!data.AbstractText && related.length === 0) {
    throw new Error('No quick results found for that search.');
  }

  return {
    heading: data.Heading || query,
    abstract: data.AbstractText,
    source: data.AbstractSource,
    sourceUrl: data.AbstractURL,
    image: data.Image ? `https://duckduckgo.com${data.Image}` : undefined,
    related,
  };
}

/** Current weather for a city via wttr.in's JSON API (no key). */
export async function getWeather(city) {
  const res = await fetch(
    `https://wttr.in/${encodeURIComponent(city)}?format=j1`,
    { signal: AbortSignal.timeout(DEFAULT_TIMEOUT), headers: { 'User-Agent': 'curl/8' } },
  );
  if (!res.ok) throw new Error(`Weather service returned HTTP ${res.status}.`);
  const data = await res.json();
  const cur = data?.current_condition?.[0];
  const area = data?.nearest_area?.[0];
  if (!cur) throw new Error('Could not find weather for that location.');
  return {
    location: [area?.areaName?.[0]?.value, area?.country?.[0]?.value].filter(Boolean).join(', ') || city,
    description: cur.weatherDesc?.[0]?.value || 'Unknown',
    tempC: cur.temp_C,
    tempF: cur.temp_F,
    feelsLikeC: cur.FeelsLikeC,
    feelsLikeF: cur.FeelsLikeF,
    humidity: cur.humidity,
    windKmph: cur.windspeedKmph,
  };
}

/** Text translation via Google Translate's public (unofficial, keyless) endpoint. */
export async function translateText(text, targetLang) {
  const res = await fetch(
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`,
    { signal: AbortSignal.timeout(DEFAULT_TIMEOUT) },
  );
  if (!res.ok) throw new Error(`Translation service returned HTTP ${res.status}.`);
  const data = await res.json();
  const translated = (data?.[0] || []).map(chunk => chunk[0]).join('');
  const detectedFrom = data?.[2];
  if (!translated) throw new Error('Could not translate that text.');
  return { text: translated, from: detectedFrom || 'auto' };
}

/** Wikipedia summary lookup via Wikipedia's official search API (no key). */
export async function wikiSearch(query) {
  const res = await fetch(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=1`,
    { signal: AbortSignal.timeout(DEFAULT_TIMEOUT) },
  );
  if (!res.ok) throw new Error(`Wikipedia returned HTTP ${res.status}.`);
  const data = await res.json();
  const hit = data?.query?.search?.[0];
  if (!hit) throw new Error('No Wikipedia article found for that topic.');
  const snippet = hit.snippet.replace(/<[^>]+>/g, '');
  return {
    title: hit.title,
    snippet,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(hit.title.replace(/ /g, '_'))}`,
  };
}

/** Song lyrics via lyrics.ovh's public API (no key). */
export async function getLyrics(artist, title) {
  const res = await fetch(
    `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`,
    { signal: AbortSignal.timeout(DEFAULT_TIMEOUT) },
  );
  if (res.status === 404) throw new Error(`No lyrics found for "${title}" by ${artist}.`);
  if (!res.ok) throw new Error(`Lyrics service returned HTTP ${res.status}.`);
  const data = await res.json();
  if (!data?.lyrics) throw new Error(`No lyrics found for "${title}" by ${artist}.`);
  return data.lyrics.trim();
}

export default {
  youtubeSearch,
  youtubeDownload,
  tiktokDownload,
  instagramDownload,
  facebookDownload,
  twitterDownload,
  spotifyDownload,
  pinterestSearch,
  apkSearch,
  webSearch,
  getWeather,
  translateText,
  wikiSearch,
  getLyrics,
};

/**
 * Fetch a media URL into a buffer, following redirects.
 *
 * Why: downloader backends (e.g. c.ymcdn.org) hand out short-lived,
 * single-token stream URLs. Handing the raw URL to baileys means the fetch
 * happens later — by which time the token can already be 410 Gone
 * ("Failed to fetch stream from ..."). Buffering immediately, right after
 * the backend response, decouples the send from the token's lifetime.
 *
 * @returns {Promise<{ buffer: Buffer, mimetype: string }>}
 */
export async function downloadMediaBuffer(url, { timeoutMs = 60000, maxBytes = 100 * 1024 * 1024 } = {}) {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  if (!response.ok) {
    throw new Error(`stream fetch failed (HTTP ${response.status})`);
  }
  const len = Number(response.headers.get('content-length') || 0);
  if (len && len > maxBytes) {
    throw new Error(`file too large (${(len / 1024 / 1024).toFixed(1)} MB, limit ${(maxBytes / 1024 / 1024)} MB)`);
  }
  const mimetype = (response.headers.get('content-type') || '').split(';')[0].trim() || 'application/octet-stream';
  // A 502/503 from the CDN's own edge (Cloudflare et al.) sometimes rides in
  // on a "soft" 200 — an HTML/JSON error page instead of a real HTTP error
  // code. response.ok alone misses that. Reject those content-types outright
  // rather than let a caller force a media mimetype onto an error page (see
  // isPlausibleMedia below for the belt-and-suspenders byte-level check too).
  if (/^(text\/html|text\/plain|application\/json|application\/xml|text\/xml)/i.test(mimetype)) {
    throw new Error(`stream returned ${mimetype} instead of media — the source is likely down or the link expired`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error('empty stream');
  if (buffer.length > maxBytes) throw new Error(`file too large (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);
  return { buffer, mimetype };
}

/**
 * Belt-and-suspenders check before a caller force-labels an ambiguous
 * content-type as a specific media mimetype (e.g. play.js falling back to
 * 'audio/mpeg' for any non-'audio/*' content-type). Recognizes magic bytes
 * for the formats these download commands actually produce. Returns false
 * for anything that looks like text (HTML/JSON/XML) even if it slipped past
 * the content-type gate above — never ships an error page as "media".
 *
 * @param {Buffer} buffer
 * @returns {boolean}
 */
export function isPlausibleMedia(buffer) {
  if (!buffer || buffer.length < 4) return false;
  const head = buffer.subarray(0, 16);
  const text = head.toString('utf8').trimStart();
  if (text.startsWith('<') || text.startsWith('{') || text.startsWith('[')) return false; // html/xml/json
  // MP3: ID3 tag, or an MPEG frame sync (0xFFEx-0xFFFx after masking the low bits we don't care about)
  if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) return true; // 'ID3'
  if (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) return true; // MPEG frame sync
  // MP4/M4A/MOV family: 'ftyp' box at offset 4
  if (head.length >= 8 && head.subarray(4, 8).toString('ascii') === 'ftyp') return true;
  // WebM/Matroska: EBML header
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return true;
  // OGG (Opus/Vorbis)
  if (head.subarray(0, 4).toString('ascii') === 'OggS') return true;
  // WAV: 'RIFF' ... 'WAVE'
  if (head.subarray(0, 4).toString('ascii') === 'RIFF') return true;
  // Unrecognized binary — don't block formats we haven't enumerated; only
  // text-shaped bodies are rejected above.
  return true;
}
