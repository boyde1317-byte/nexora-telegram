import crypto from 'crypto';

import { URL } from 'url';

const cache = new Map();
const MAX_CACHE_ENTRIES = 500;

// ── SSRF Protection ──────────────────────────────────────────────────────
// Block requests to private, loopback, and cloud metadata endpoints.
function isSafeUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.local') ||
      hostname === '169.254.169.254' ||
      /^127\.\d+\.\d+\.\d+$/.test(hostname) ||
      /^10\.\d+\.\d+\.\d+$/.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(hostname) ||
      /^192\.168\.\d+\.\d+$/.test(hostname) ||
      hostname === '0.0.0.0' || hostname === '::1'
    ) {
      return false;
    }
    return true;
  } catch (_) {
    return false;
  }
}

function setBoundedCache(key, value) {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
  cache.set(key, value);
}

// Max response body size — 10MB. Prevents OOM from large/malicious responses.
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

export class WebClient {
  constructor(options = {}) {
    this.timeout = options.timeout || 15000;
    this.retries = options.retries || 2;
  }

  async fetch(url, options = {}) {
    const { retries = this.retries, useCache = false, cacheTtl = 60000, ...fetchOptions } = options;
    const cacheKey = useCache ? crypto.createHash('md5').update(url + JSON.stringify(fetchOptions)).digest('hex') : null;

    if (useCache && cache.has(cacheKey)) {
      const cached = cache.get(cacheKey);
      if (Date.now() - cached.timestamp < cacheTtl) {
        return cached.data;
      }
      cache.delete(cacheKey);
    }

    let lastError;
    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), this.timeout);
        
        const response = await fetch(url, { ...fetchOptions, signal: controller.signal });
        clearTimeout(id);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // ── Guard against oversized responses ────────────────────────────
        const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
        if (contentLength > MAX_RESPONSE_BYTES) {
          throw new Error(`Response too large: ${contentLength} bytes exceeds ${MAX_RESPONSE_BYTES} limit`);
        }

        const contentType = response.headers.get('content-type') || '';
        let data;

        if (contentType.includes('application/json')) {
          // Read as text first, then parse — allows size checking before full allocation
          const text = await response.text();
          if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) {
            throw new Error(`Response body exceeds ${MAX_RESPONSE_BYTES} byte limit`);
          }
          data = JSON.parse(text);
        } else if (contentType.includes('text/')) {
          data = await response.text();
          if (Buffer.byteLength(data) > MAX_RESPONSE_BYTES) {
            throw new Error(`Response body exceeds ${MAX_RESPONSE_BYTES} byte limit`);
          }
        } else {
          const buf = Buffer.from(await response.arrayBuffer());
          if (buf.length > MAX_RESPONSE_BYTES) {
            throw new Error(`Response body exceeds ${MAX_RESPONSE_BYTES} byte limit`);
          }
          data = buf;
        }

        if (useCache && cacheKey) {
          setBoundedCache(cacheKey, { timestamp: Date.now(), data });
        }
        return { data, headers: response.headers, status: response.status };
      } catch (error) {
        lastError = error;
        if (attempt <= retries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
    throw lastError;
  }
}

export const webClient = new WebClient();

// ─────────────────────────────────────────────────────────────────────────────
// Fuzzy timezone resolution — turns user input like 'london', 'nyc' or
// 'europe/paris' into a valid IANA zone before Intl chokes on it.
// ─────────────────────────────────────────────────────────────────────────────
const CITY_ALIASES = new Map(Object.entries({
  'nyc': 'America/New_York', 'newyork': 'America/New_York', 'new york': 'America/New_York',
  'la': 'America/Los_Angeles', 'losangeles': 'America/Los_Angeles', 'los angeles': 'America/Los_Angeles',
  'sf': 'America/Los_Angeles', 'sanfrancisco': 'America/Los_Angeles', 'san francisco': 'America/Los_Angeles',
  'vegas': 'America/Los_Angeles', 'chicago': 'America/Chicago',
  'houston': 'America/Chicago', 'dallas': 'America/Chicago',
  'toronto': 'America/Toronto', 'vancouver': 'America/Vancouver',
  'mexicocity': 'America/Mexico_City', 'mexico city': 'America/Mexico_City',
  'saopaulo': 'America/Sao_Paulo', 'sao paulo': 'America/Sao_Paulo', 'rio': 'America/Sao_Paulo',
  'buenosaires': 'America/Argentina/Buenos_Aires', 'buenos aires': 'America/Argentina/Buenos_Aires',
  'london': 'Europe/London', 'paris': 'Europe/Paris', 'berlin': 'Europe/Berlin',
  'madrid': 'Europe/Madrid', 'rome': 'Europe/Rome', 'amsterdam': 'Europe/Amsterdam',
  'moscow': 'Europe/Moscow', 'kyiv': 'Europe/Kyiv', 'kiev': 'Europe/Kyiv',
  'lisbon': 'Europe/Lisbon', 'dublin': 'Europe/Dublin', 'zurich': 'Europe/Zurich',
  'vienna': 'Europe/Vienna', 'prague': 'Europe/Prague', 'stockholm': 'Europe/Stockholm',
  'athens': 'Europe/Athens', 'warsaw': 'Europe/Warsaw', 'istanbul': 'Europe/Istanbul',
  'accra': 'Africa/Accra', 'lagos': 'Africa/Lagos', 'abuja': 'Africa/Lagos',
  'nairobi': 'Africa/Nairobi', 'cairo': 'Africa/Cairo', 'casablanca': 'Africa/Casablanca',
  'johannesburg': 'Africa/Johannesburg', 'joburg': 'Africa/Johannesburg',
  'capetown': 'Africa/Johannesburg', 'cape town': 'Africa/Johannesburg',
  'kampala': 'Africa/Kampala', 'kigali': 'Africa/Kigali', 'dar': 'Africa/Dar_es_Salaam',
  'addis': 'Africa/Addis_Ababa', 'tunis': 'Africa/Tunis', 'algiers': 'Africa/Algiers',
  'dakar': 'Africa/Dakar', 'kinshasa': 'Africa/Kinshasa',
  'dubai': 'Asia/Dubai', 'riyadh': 'Asia/Riyadh', 'doha': 'Asia/Qatar',
  'kuwait': 'Asia/Kuwait', 'tehran': 'Asia/Tehran', 'baghdad': 'Asia/Baghdad',
  'israel': 'Asia/Jerusalem', 'jerusalem': 'Asia/Jerusalem',
  'karachi': 'Asia/Karachi', 'lahore': 'Asia/Karachi', 'islamabad': 'Asia/Karachi',
  'delhi': 'Asia/Kolkata', 'new delhi': 'Asia/Kolkata', 'mumbai': 'Asia/Kolkata',
  'bangalore': 'Asia/Kolkata', 'kolkata': 'Asia/Kolkata', 'india': 'Asia/Kolkata',
  'dhaka': 'Asia/Dhaka', 'colombo': 'Asia/Colombo', 'kathmandu': 'Asia/Kathmandu',
  'beijing': 'Asia/Shanghai', 'shanghai': 'Asia/Shanghai', 'china': 'Asia/Shanghai',
  'hongkong': 'Asia/Hong_Kong', 'hong kong': 'Asia/Hong_Kong', 'hk': 'Asia/Hong_Kong',
  'taipei': 'Asia/Taipei', 'seoul': 'Asia/Seoul', 'korea': 'Asia/Seoul',
  'tokyo': 'Asia/Tokyo', 'japan': 'Asia/Tokyo', 'singapore': 'Asia/Singapore',
  'kl': 'Asia/Kuala_Lumpur', 'kualalumpur': 'Asia/Kuala_Lumpur', 'kuala lumpur': 'Asia/Kuala_Lumpur',
  'jakarta': 'Asia/Jakarta', 'manila': 'Asia/Manila', 'bangkok': 'Asia/Bangkok',
  'hanoi': 'Asia/Ho_Chi_Minh', 'saigon': 'Asia/Ho_Chi_Minh',
  'sydney': 'Australia/Sydney', 'melbourne': 'Australia/Melbourne',
  'brisbane': 'Australia/Brisbane', 'perth': 'Australia/Perth', 'auckland': 'Pacific/Auckland',
}));

/**
 * Fuzzy-resolve a user-supplied timezone string to a valid IANA zone.
 * Order: exact IANA zone → case-insensitive zone → city alias →
 * city-segment match across all IANA zones → separator-insensitive zone match.
 * Bare offsets ('+5', 'GMT-4') are rejected. Returns { zone } or null.
 */
export function resolveTimezone(input) {
  if (!input || typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw) return null;
  if (/^[+-]\d{1,2}(:?\d{2})?$/.test(raw) || /^(GMT|UTC)[+-]/i.test(raw)) return null;
  const lower = raw.toLowerCase();
  const noSpace = lower.replace(/[ _]/g, '');

  try {
    const zones = Intl.supportedValuesOf('timeZone');
    const pool = ['UTC', 'GMT', ...zones];

    const exact = pool.find((z) => z.toLowerCase() === lower);
    if (exact) return { zone: exact };

    const alias = CITY_ALIASES.get(lower);
    if (alias) return { zone: alias };

    // city segment of any zone, e.g. 'london' → Europe/London,
    // 'yangon' → Asia/Yangon; ambiguous hits prefer the shortest zone path
    const segHits = zones.filter((z) => z.split('/').pop().replace(/_/g, '').toLowerCase() === noSpace);
    if (segHits.length === 1) return { zone: segHits[0] };
    if (segHits.length > 1) {
      const best = [...segHits].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))[0];
      return { zone: best };
    }

    const zonal = pool.find((z) => z.toLowerCase().replace(/[_ /]/g, '') === noSpace);
    if (zonal) return { zone: zonal };
  } catch (_) { /* engine without supportedValuesOf */ }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Providers — all free, no API key required unless explicitly noted.
// APIs requiring keys have free-tier fallbacks listed in comments.
// ─────────────────────────────────────────────────────────────────────────────
export const Providers = {
  // ── Search (DuckDuckGo — free, no key) ───────────────────────────────────
  search: async (query) => {
    const { data } = await webClient.fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`);
    return data;
  },

  // ── News ──────────────────────────────────────────────────────────────────
  // Free fallback: Hacker News API (no key needed)
  // Paid: NewsAPI (requires NEWS_API_KEY)
  news: async (query, apiKey) => {
    if (apiKey) {
      const url = query
        ? `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&apiKey=${apiKey}`
        : `https://newsapi.org/v2/top-headlines?country=us&apiKey=${apiKey}`;
      const { data } = await webClient.fetch(url);
      return data;
    }
    // Free fallback: Hacker News top stories (no key needed)
    const { data: ids } = await webClient.fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
    const topIds = ids.slice(0, query ? 10 : 8);
    const articles = await Promise.all(
      topIds.map(id => webClient.fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`))
    );
    return {
      articles: articles.map(({ data: item }) => ({
        title: item.title,
        description: item.title,
        url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
        urlToImage: null,
        source: { name: 'Hacker News' },
        publishedAt: new Date(item.time * 1000).toISOString(),
      })),
    };
  },

  // ── Summary (SMMRY — requires key) ───────────────────────────────────────
  summary: async (url, apiKey) => {
    if (!apiKey) throw new Error("SMMRY_API_KEY environment variable is required.");
    const { data } = await webClient.fetch(`https://smmry.com/api?SM_API_KEY=${apiKey}&SM_URL=${encodeURIComponent(url)}`);
    return data;
  },

  // ── Movie lookup (OMDb — requires key, free tier 1000/day) ───────────────
  omdb: async (title, apiKey) => {
    if (!apiKey) throw new Error("OMDB_API_KEY environment variable is required.");
    const { data } = await webClient.fetch(`https://www.omdbapi.com/?t=${encodeURIComponent(title)}&apikey=${apiKey}`);
    return data;
  },

  // ── Currency (ExchangeRate-API — free, no key) ──────────────────────────
  currency: async (from, to) => {
    const { data } = await webClient.fetch(`https://api.exchangerate-api.com/v4/latest/${from.toUpperCase()}`);
    const rate = data?.rates?.[to.toUpperCase()];
    if (!rate) throw new Error(`Could not find exchange rate for ${from.toUpperCase()}/${to.toUpperCase()}`);
    return { rate, date: data.date };
  },

  // ── Weather (Open-Meteo — free, no key) ──────────────────────────────────
  weather: async (city) => {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
    const { data: geoData } = await webClient.fetch(geoUrl);
    if (!geoData?.results?.length) throw new Error(`City "${city}" not found`);
    const { latitude, longitude, name, country } = geoData.results[0];
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m`;
    const { data: weatherData } = await webClient.fetch(weatherUrl);
    return { ...weatherData, location: { name, country } };
  },

  // ── Dictionary (Free Dictionary API — free, no key) ──────────────────────
  // https://dictionaryapi.dev/
  define: async (word) => {
    const { data } = await webClient.fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    return data;
  },

  // ── DNS (Google DNS-over-HTTPS — free, no key) ────────────────────────────
  // https://developers.google.com/speed/public-dns/docs/doh/json
  dns: async (domain) => {
    const { data } = await webClient.fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`
    );
    return data;
  },

  // ── WHOIS (RDAP — free, no key) ───────────────────────────────────────────
  // https://about.rdap.org/ — RDAP is the modern replacement for WHOIS
  whois: async (domain) => {
    const { data } = await webClient.fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`);
    // Normalize RDAP response into a simple shape the plugin expects
    const events = data.events || [];
    const getEvent = (type) => events.find(e => e.eventAction === type)?.eventDate;
    const getStatus = () => (data.status || []).map(s => s.replace(/^[^:]+: ?/, ''));
    const getEntity = (role) => {
      const ent = data.entities?.find(e => e.roles?.includes(role));
      const vcard = ent?.vcardArray?.[1] || [];
      const fn = vcard.find(v => v[0] === 'fn');
      return fn ? fn[3] : (ent?.handle || 'N/A');
    };
    return {
      status: 'OK',
      whois: {
        registrar:       getEntity('registrar') || 'N/A',
        creation_date:    getEvent('registration'),
        expiration_date:  getEvent('expiration'),
        updated_date:     getEvent('last changed') || getEvent('last update of RDAP database'),
        status:           getStatus(),
      },
    };
  },

  // ── HTTP Headers (direct fetch — no API needed) ─────────────────────────
  headers: async (url) => {
    if (!isSafeUrl(url)) {
      throw new Error('Restricted URL: Requesting local or private infrastructure addresses is prohibited.');
    }
    const { headers } = await webClient.fetch(url, { method: 'HEAD' });
    const result = {};
    for (const [key, value] of headers.entries()) {
      result[key] = value;
    }
    return result;
  },

  // ── GitHub repo lookup (GitHub API — free, 60/hr no key) ─────────────────
  // Accepts "owner/repo" format (e.g. "facebook/react")
  github: async (repo) => {
    // GitHub's API 404s on %2F — encode owner and repo separately so the
    // path keeps its literal slash: repos/owner/repo, never owner%2Frepo.
    const [owner, ...rest] = String(repo).split('/');
    const repoName = rest.join('/');
    if (!owner || !repoName) throw new Error('Invalid repo format — use owner/repo');
    // Optional token: raises the rate limit (60→5000/hr) and lets the
    // command see private repos. Set GITHUB_TOKEN in the bot environment.
    const ghHeaders = { 'Accept': 'application/vnd.github.v3+json' };
    if (process.env.GITHUB_TOKEN) ghHeaders['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
    const { data } = await webClient.fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}`,
      { headers: ghHeaders, useCache: true }
    );
    return data;
  },

  // ── Translate (MyMemory API — free, no key for limited daily use) ────────
  // https://mymemory.translated.net/doc/spec.php
  // Accepts (text, targetLang) — source language auto-detected
  translate: async (text, targetLang) => {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=autodetect|${encodeURIComponent(targetLang)}`;
    const { data } = await webClient.fetch(url);
    if (data.responseStatus !== 200 && data.responseStatus !== '200') {
      throw new Error(data.responseDetails || 'Translation failed.');
    }
    return data.responseData.translatedText;
  },

  // ── Calculator (math.js API — free, no key) ──────────────────────────────
  // https://api.mathjs.org/
  calculator: async (expr) => {
    const { data } = await webClient.fetch(
      `https://api.mathjs.org/v4/?expr=${encodeURIComponent(expr)}`
    );
    return String(data).trim();
  },

  // ── Crypto prices (CoinGecko — free, no key) ─────────────────────────────
  // https://www.coingecko.com/api/documentation
  crypto: async (coin) => {
    const id = coin.toLowerCase();
    const { data } = await webClient.fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd,eur,gbp&include_24hr_change=true`
    );
    if (!data || !data[id]) throw new Error(`Coin "${coin}" not found. Try: bitcoin, ethereum, solana, etc.`);
    return data[id];
  },

  // ── NASA APOD (free with auto-approved key, or demo key) ──────────────────
  // https://api.nasa.gov/ — demo key "DEMO_KEY" works for limited requests
  apod: async () => {
    const { data } = await webClient.fetch(
      `https://api.nasa.gov/planetary/apod?api_key=${process.env.NASA_API_KEY || 'DEMO_KEY'}`
    );
    return data;
  },

  // ── NPM registry (free, no key) ──────────────────────────────────────────
  // Returns the full registry document: name, description, dist-tags,
  // versions, author, repository. Scoped names are percent-encoded the
  // same way the npm CLI does it — the registry decodes %2F back to '/'.
  npm: async (pkg) => {
    // The registry wants the scope slash as %2F but the @ left literal:
    // encodeURIComponent('@types/node') → '%40types%2Fnode' → HTTP 404.
    const encoded = pkg.trim().replace(/^\/+|\/+$/g, '').replace(/\//g, '%2F');

    // Fetch the /latest manifest (a few KB) instead of the full packument —
    // big packages like @types/node ship packuments over the 10MB body cap.
    let manifest = null;
    try {
      const { data } = await webClient.fetch(
        `https://registry.npmjs.org/${encoded}/latest`,
        { useCache: true, cacheTtl: 300000, retries: 1 }
      );
      manifest = data && data.name ? data : null;
    } catch (e) {
      if (!/\b404\b/.test(e.message)) throw e;  // network/server errors still bubble
    }

    if (manifest) {
      // weekly downloads — best-effort enrichment, never fatal
      try {
        const { data } = await webClient.fetch(
          `https://api.npmjs.org/downloads/point/last-week/${encoded}`,
          { useCache: true, cacheTtl: 3600000, retries: 1 }
        );
        manifest.weeklyDownloads = typeof data?.downloads === 'number' ? data.downloads : null;
      } catch (_) {
        manifest.weeklyDownloads = null;
      }
      return manifest;
    }

    // unknown package — find close matches instead of a dead-end 404
    const { data } = await webClient.fetch(
      `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(pkg)}&size=5`
    );
    const err = new Error(`package "${pkg}" not found on npm`);
    err.notFound = true;
    err.suggestions = (data.objects || [])
      .map((o) => o.package)
      .map(({ name, version, description }) => ({
        name, version,
        desc: (description || '').slice(0, 80),
      }));
    throw err;
  },

  // ── MDN docs search (free, no key) ────────────────────────────────────────
  // Returns { documents: [{ title, summary, mdn_url, ... }] }.
  docs: async (query) => {
    const { data } = await webClient.fetch(
      `https://developer.mozilla.org/api/v1/search?q=${encodeURIComponent(query)}&locale=en-US`,
      { useCache: true }
    );
    return data;
  },

  // ── World time (computed locally via Intl — no network, no key) ────────────
  // Returns { timezone, datetime, utc_offset, abbreviation } for any IANA
  // timezone (e.g. 'Africa/Accra', 'America/New_York', 'UTC').
  // worldtimeapi.org was unreachable too often, so this is computed from
  // the runtime's own tz database instead — offline, unlimited, instant.
  // Invalid zones throw RangeError from Intl → normalized below.
  time: async (timezone) => {
    try {
      const resolved = resolveTimezone(timezone);
      if (!resolved) throw new Error(`Invalid or unknown timezone: ${timezone}`);
      timezone = resolved.zone;
      const now = new Date();
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hourCycle: 'h23',
        timeZoneName: 'short'
      }).formatToParts(now);
      const get = (type) => parts.find(p => p.type === type)?.value || '';

      // Offset (e.g. 'GMT+00:00' → '+00:00') via a second format call
      const longOffset = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone, timeZoneName: 'longOffset'
      }).formatToParts(now).find(p => p.type === 'timeZoneName')?.value || 'GMT';
      const utcOffset = longOffset === 'GMT'
        ? '+00:00'
        : longOffset.replace('GMT', '').replace(/^([+-])(\d{2}):(\d{2}).*$/, '$1$2:$3') || '+00:00';

      return {
        timezone,
        // Offset appended so Date parses it absolutely, not server-local
        datetime: `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}${utcOffset}`,
        utc_offset: utcOffset,
        abbreviation: get('timeZoneName') || 'UTC'
      };
    } catch (_) {
      throw new Error(`Invalid or unknown timezone: ${timezone}`);
    }
  },

  // ── Screenshot (WordPress mShots — free, no key) ──────────────────────────
  // Returns an image Buffer. Prepends https:// when the caller omitted it.
  screenshot: async (url, opts = {}) => {
    const target = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const w = opts.width || 1280;
    const h = opts.height || (opts.tall ? 2400 : 800);
    const shotUrl = `https://s.wordpress.com/mshots/v1/${encodeURIComponent(target)}?w=${w}&h=${h}`;
    // mshots returns a small gray "generating…" placeholder the first time
    // it sees a URL — poll once after a beat so users get the real render.
    let data = (await webClient.fetch(shotUrl, { useCache: true, cacheTtl: 600000 })).data;
    if (!data?.length || data.length < 15000) {
      await new Promise(r => setTimeout(r, 2500));
      data = (await webClient.fetch(shotUrl, { useCache: false })).data;
    }
    return data; // Buffer (image)
  },
};

export default { webClient, Providers };
