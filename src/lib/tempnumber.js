/**
 * tempnumber.js — public disposable SMS numbers (Omegatech Temp-number).
 *
 *   GET https://api.omegatech.app/api/tools/Temp-number?action=numbers
 *       → { data: { total, numbers: [{ id, country, flag, countryCode, number }] } }
 *   GET ...?action=otps&limit=N
 *       → { data: { total, otps: [{ time, country, flag, number, maskedNumber,
 *                                   sender, otp, message }] } }
 *
 * Quirks found while wiring (2026-10-23):
 *  - the only server-side param that works is `limit` on action=otps;
 *    country/service/number params are silently ignored → filter client-side
 *  - action=numbers returns all 14k entries in one shot (~1.5 MB) → cached
 *    in-memory with a 10-minute TTL
 *  - shared/public numbers: any OTP that lands is visible to everyone
 */
const BASE = 'https://api.omegatech.app/api/tools/Temp-number';
const NUMBERS_TTL_MS = 10 * 60 * 1000;

let numbersCache = { at: 0, list: [] };

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`omegatech HTTP ${res.status}`);
  const data = await res.json();
  if (data.success !== true || !data.data) throw new Error(data.error || 'omegatech refused');
  return data.data;
}

/** All available temp numbers, cached for 10 minutes. */
export async function getNumbers() {
  if (Date.now() - numbersCache.at < NUMBERS_TTL_MS && numbersCache.list.length) {
    return numbersCache.list;
  }
  const data = await getJson(`${BASE}?action=numbers`);
  numbersCache = { at: Date.now(), list: data.numbers || [] };
  return numbersCache.list;
}

/** Latest received OTPs. limit is the one server-side param that works. */
export async function getOtps({ limit = 100 } = {}) {
  const data = await getJson(`${BASE}?action=otps&limit=${Math.min(limit, 100)}`);
  return data.otps || [];
}

/** Case-insensitive substring filter across country/sender/number/message. */
export function filterOtps(otps, term) {
  if (!term) return otps;
  const t = term.toLowerCase();
  return otps.filter((o) =>
    [o.country, o.sender, o.number, o.maskedNumber, o.message, o.otp]
      .some((v) => String(v || '').toLowerCase().includes(t))
  );
}

/** Distinct countries with counts, for the picker list. */
export async function getCountries() {
  const list = await getNumbers();
  const counts = new Map();
  for (const n of list) {
    counts.set(n.country, (counts.get(n.country) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([country, count]) => ({ country, count, flag: list.find((n) => n.country === country)?.flag || '' }))
    .sort((a, b) => b.count - a.count);
}
