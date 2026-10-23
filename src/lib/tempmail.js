/**
 * tempmail.js — keyless disposable-email client (temp-mail.io).
 *
 * Ported from OURIN DELUXE V3.4.1 (src/scraper/tempmail.js), restyled to
 * match the NEXORA fetch conventions (AbortSignal timeouts, no axios).
 *
 *   createTempMail()      → { ok, email, token }  — a fresh inbox address
 *   getInbox(email)       → { ok, messages[] }   — messages: { from, subject,
 *                                                   created_at, body_text }
 *
 * Addresses are disposable by design — treat them as throwaway.
 */
const API = 'https://api.internal.temp-mail.io/api/v3';

function randomCorsHeader(length = 15) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function buildHeaders() {
  return {
    'Content-Type': 'application/json',
    'Application-Name': 'web',
    'Application-Version': '4.0.0',
    'X-CORS-Header': randomCorsHeader(),
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    Referer: 'https://temp-mail.io/',
  };
}

/** Create a new disposable inbox address. */
export async function createTempMail() {
  try {
    const res = await fetch(`${API}/email/new`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ min_name_length: 10, max_name_length: 12 }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`temp-mail.io returned HTTP ${res.status}.`);
    const data = await res.json();
    if (!data?.email) throw new Error('temp-mail.io returned no address.');
    return { ok: true, email: data.email, token: data.token ?? null };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** Fetch the inbox for an existing address. */
export async function getInbox(email) {
  try {
    // NOTE: the email goes in the path RAW — encodeURIComponent turns '@' into
    // '%40', which temp-mail.io rejects with HTTP 400. '@' and '.' are path-safe.
    const res = await fetch(`${API}/email/${email}/messages`, {
      headers: buildHeaders(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`temp-mail.io returned HTTP ${res.status}.`);
    const messages = await res.json();
    return { ok: true, messages: Array.isArray(messages) ? messages : [] };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** Trim a temp-mail.io timestamp ("2026-10-23T11:29:00.000Z") to "2026-10-23 11:29". */
export function formatMailTime(created_at) {
  if (!created_at) return 'unknown time';
  return String(created_at).slice(0, 16).replace('T', ' ');
}
