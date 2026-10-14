/**
 * jakyApi.js — client for api.jaky.dev (ephoto360 effects, CapCut maker,
 * paper animation, Alight Motion accounts).
 *
 * Auth: `x-jaky-key` header — set JAKY_API_KEY in .env.
 * Docs playground: https://api.jaky.dev/playground
 *
 * Endpoint map (verified against the live API):
 *   GET  /v1/ephoto360                     → category list
 *   GET  /v1/ephoto360/<category>          → effect list for that category
 *   POST /v1/ephoto360/<category>         → render: { id, text, imageUrl? }
 *   POST /v1/maker/paperanimation         → render: { text } → mp4 url
 *   POST /v1/maker/capcut                 → render: { url|templateId, media }
 *   GET  /v1/alight-motion/bulk            → create Pro account(s)
 *
 * Never throws — callers get { ok, data } / { ok:false, error } and can
 * branch on it without try/catch noise.
 */

const BASE_URL = (process.env.JAKY_API_URL || 'https://api.jaky.dev').replace(/\/$/, '');

export function jakyKey() {
  return process.env.JAKY_API_KEY || '';
}

async function request(method, path, body = null, timeoutMs = 180000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(BASE_URL + path, {
      method,
      headers: {
        'x-jaky-key': jakyKey(),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      data = { status: false, msg: text.slice(0, 300) };
    }
    return { ok: res.ok && data?.status !== false, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: { status: false, msg: err.name === 'AbortError' ? 'Request timed out.' : (err.message || 'network error') } };
  } finally {
    clearTimeout(timer);
  }
}

export const jaky = {
  hasKey: () => !!jakyKey(),

  get: (path, timeoutMs = 60000) => request('GET', path, null, timeoutMs),

  post: (path, body = {}, timeoutMs = 180000) => request('POST', path, body, timeoutMs),

  /** Download a rendered result (image / mp4) to a Buffer. */
  async download(url, timeoutMs = 120000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch (_) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  },

  /**
   * Upload a local media buffer to a short-lived public URL the API can
   * fetch (needed for CapCut media fills and photo-based ephoto effects).
   * Uses uguu.se — free, no key, up to 128MB, ~3h retention, the same host
   * jaky.dev itself serves rendered output from.
   */
  async uploadMedia(buffer, filename = 'media.jpg') {
    try {
      const form = new FormData();
      form.append('files[]', new Blob([buffer]), filename);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 90000);
      try {
        const res = await fetch('https://uguu.se/upload', {
          method: 'POST',
          body: form,
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        const text = await res.text();
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch (_) {
          parsed = null;
        }
        const url = parsed?.files?.[0]?.url
          || (typeof parsed?.url === 'string' ? parsed.url : null)
          || (/^https?:\/\//.test(text.trim()) ? text.trim() : null);
        return url ? { ok: true, url } : { ok: false, error: 'upload failed' };
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      return { ok: false, error: err.message || 'upload failed' };
    }
  },
};
