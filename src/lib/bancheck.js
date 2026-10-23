/**
 * bancheck.js — layered WhatsApp number ban checker.
 *
 * WhatsApp has no wire-level "banned" flag: a banned number is simply
 * delisted, so a plain exists query can't tell *banned* apart from
 * *never registered*. This module layers three signals so `.check`
 * answers correctly instead of guessing:
 *
 *   1. session lookup (sock.onWhatsApp)  — on WhatsApp right now?
 *   2. tokenless exist probe             — sessionless registered check,
 *      works for arbitrary numbers (verified live 2026-10-23: with a
 *      current iOS-style User-Agent the v2/exist endpoint answers with
 *      NO token and NO encryption: `status ok`/`type existing` =
 *      registered, `reason incorrect` = not on WhatsApp)
 *   3. local history                      — a number we previously saw
 *      active that is now gone is banned/deleted with high confidence;
 *      a number never seen active simply never existed
 *
 * Version floor: the tokenless probe's UA must stay current. If every
 * probe answers `old_version`, bump TOKENLESS_UA to the latest iOS
 * release. (2.26.x worked Jul 2026; 2.27.x confirmed 2026-10-23.)
 *
 * Banned-number calibration: when the probe ever returns a distinct ban
 * reason (e.g. `blocked`), add it to BAN_REASONS below — the module then
 * reports a confirmed ban instead of relying on history.
 */

import * as crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import libsignal from 'libsignal';

const curve = libsignal.curve;

// ── history ────────────────────────────────────────────────────────────────

const HISTORY_PATH = process.env.BANCHECK_HISTORY_PATH
  || path.resolve(process.cwd(), 'database/bancheck-history.jsonl');

/**
 * Record a sighting. `active` = confirmed on WhatsApp, `gone` = confirmed
 * not on WhatsApp. Call this whenever the bot reliably learns a number's
 * state — .check does it automatically; handlers may call recordSighting
 * on group joins etc.
 */
export function recordSighting(number, state, source = 'check') {
  try {
    const dir = path.dirname(HISTORY_PATH);
    fs.mkdirSync(dir, { recursive: true });
    const clean = String(number).replace(/\D/g, '');
    const line = JSON.stringify({ number: clean, state, at: Date.now(), source });
    fs.appendFileSync(HISTORY_PATH, line + '\n', 'utf-8');
  } catch (err) {
    console.warn('[bancheck] history write failed:', err?.message || err);
  }
}

function readHistory() {
  try {
    return fs.readFileSync(HISTORY_PATH, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** Last event where the number was confirmed active, else null. */
export function wasActiveBefore(number) {
  const clean = String(number).replace(/\D/g, '');
  const events = readHistory();
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i];
    if (e.number === clean && e.state === 'active') return e;
  }
  return null;
}

// ── tokenless exist probe ──────────────────────────────────────────────────

export const TOKENLESS_UA = 'WhatsApp/2.27.5.12 iOS/18.0.1 Device/Apple-iPhone_15';

/** Server reasons that mean "banned" — extend after calibrating with a
 *  number you know is banned (the raw response is in result.raw). */
const BAN_REASONS = new Set(['blocked', 'banned', 'deactivated']);

const CC_ONE_DIGIT = new Set(['1', '7']);
const CC_THREE_DIGIT = new Set([
  '212', '213', '216', '218', '220', '221', '222', '223', '224', '225', '226', '227', '228', '229',
  '230', '231', '232', '233', '234', '235', '236', '237', '238', '239', '240', '241', '242', '243',
  '244', '245', '246', '247', '248', '249', '250', '251', '252', '253', '254', '255', '256', '257',
  '258', '260', '261', '262', '263', '264', '265', '266', '267', '268', '269', '290', '291', '297',
  '298', '299', '350', '351', '352', '353', '354', '355', '356', '357', '358', '359', '370', '371',
  '372', '373', '374', '375', '376', '377', '378', '379', '380', '381', '382', '383', '385', '386',
  '387', '389', '420', '421', '423', '500', '501', '502', '503', '504', '505', '506', '507', '508',
  '509', '590', '591', '592', '593', '594', '595', '596', '597', '598', '599', '670', '672', '673',
  '674', '675', '676', '677', '678', '679', '680', '681', '682', '683', '684', '685', '686', '687',
  '688', '689', '690', '691', '692', '850', '852', '853', '855', '856', '870', '880', '886', '960',
  '961', '962', '963', '964', '965', '966', '967', '968', '970', '971', '972', '973', '974', '975',
  '976', '977', '992', '993', '994', '995', '996', '998',
]);

function splitCc(number) {
  if (CC_ONE_DIGIT.has(number.slice(0, 1))) return [number.slice(0, 1), number.slice(1)];
  if (CC_THREE_DIGIT.has(number.slice(0, 3))) return [number.slice(0, 3), number.slice(3)];
  return [number.slice(0, 2), number.slice(2)];
}

const b64url = (b) => Buffer.from(b).toString('base64url');
const toUrlHex = (b) => [...b].map((x) => '%' + x.toString(16).padStart(2, '0')).join('');

// client-side spacing: the endpoint rate-limits aggressively
const lastProbe = { t: 0 };
const MIN_SPACING_MS = 3000;

export function normalizeExistResponse(raw) {
  const reason = raw?.reason ?? null;
  if (raw?.status === 'ok') return { verdict: 'registered', reason, raw };
  if (raw?.type === 'existing') return { verdict: 'registered', reason, raw };
  if (raw?.wa_old_device_name || raw?.wa_old_eligible === 1) {
    return { verdict: 'registered', reason, raw };
  }
  if (reason && BAN_REASONS.has(reason)) return { verdict: 'banned', reason, raw };
  if (reason === 'incorrect') return { verdict: 'not_on_whatsapp', reason, raw };
  if (reason === 'temporarily_unavailable') return { verdict: 'throttled', reason, raw };
  if (reason === 'old_version') return { verdict: 'old_version', reason, raw };
  if (reason === 'bad_param') return { verdict: 'bad_param', reason, raw };
  return { verdict: 'unknown', reason, raw };
}

/**
 * Sessionless tokenless exists probe — works for ANY number, no app
 * constants needed. Returns normalized verdict + raw server response.
 */
export async function probeExistTokenless(number, ua = TOKENLESS_UA) {
  const clean = String(number).replace(/\D/g, '');
  if (clean.length < 7) throw new Error('number too short');
  const [cc, inNumber] = splitCc(clean);

  const identity = curve.generateKeyPair();
  const noise = curve.generateKeyPair();
  const preKey = curve.generateKeyPair();
  const regId = crypto.randomInt(1, 0x3fff);
  const skeyId = crypto.randomInt(1, 0xffff);

  const regIdBuf = Buffer.alloc(4);
  regIdBuf.writeInt32BE(regId);
  const skeyIdBuf = Buffer.concat([Buffer.alloc(1), Buffer.from([(skeyId >>> 8) & 0xff, skeyId & 0xff])]);
  const preKeyPub = preKey.pubKey.length === 33 ? preKey.pubKey : Buffer.concat([Buffer.from([5]), preKey.pubKey]);

  const params = [
    ['cc', cc],
    ['in', inNumber],
    ['lg', 'en'],
    ['lc', 'GB'],
    ['authkey', b64url(noise.pubKey)],
    ['e_regid', b64url(regIdBuf)],
    ['e_keytype', 'BQ'],
    ['e_ident', b64url(identity.pubKey)],
    ['e_skey_id', b64url(skeyIdBuf)],
    ['e_skey_val', b64url(preKey.pubKey)],
    ['e_skey_sig', b64url(curve.calculateSignature(identity.privKey, preKeyPub))],
    ['id', toUrlHex(crypto.randomBytes(20))],
  ];
  const query = params.map(([k, v]) => `${k}=${v}`).join('&');

  const wait = lastProbe.t + MIN_SPACING_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastProbe.t = Date.now();

  const res = await fetch('https://v.whatsapp.net/v2/exist?' + query, {
    headers: { 'User-Agent': ua, 'Accept': 'text/json' },
  });
  const raw = await res.json();
  return normalizeExistResponse(raw);
}

// ── layered checker ────────────────────────────────────────────────────────

export const BAN_STATUS_TEXT = {
  not_banned: 'Not banned — on WhatsApp',
  banned: 'BANNED (confirmed by WhatsApp)',
  likely_banned: 'Likely banned/deleted — was on WhatsApp before, gone now',
  never_registered: 'Never on WhatsApp',
  unknown: 'Could not determine',
};

/**
 * The full layered check. `sock` is a Baileys socket (or the Telegram
 * panel's proxied main-session socket — onWhatsApp passes through).
 * Returns { number, registered, ban, evidence }.
 */
export async function checkNumber(sock, number, opts = {}) {
  const clean = String(number).replace(/\D/g, '');
  const useSession = opts.session !== false && typeof sock?.onWhatsApp === 'function';
  const useProbe = opts.probe !== false; // tokenless probe, no constants needed

  // 1. session exists lookup
  let registered = null;
  if (useSession) {
    try {
      const [info] = await sock.onWhatsApp(clean);
      registered = Boolean(info?.exists);
    } catch {
      registered = null;
    }
  }

  // 2. tokenless exists probe (sessionless ground truth for "on WhatsApp")
  let probe = null;
  if (useProbe) {
    try {
      probe = await probeExistTokenless(clean, opts.ua);
    } catch {
      probe = null;
    }
  }

  // merge: the probe is the authority on registration for arbitrary numbers
  if (probe?.verdict === 'registered') {
    registered = true;
    recordSighting(clean, 'active', 'probe');
    return { number: clean, registered: true, ban: 'not_banned', evidence: { probe } };
  }
  if (probe?.verdict === 'banned') {
    recordSighting(clean, 'gone', 'probe');
    return { number: clean, registered: false, ban: 'banned', evidence: { probe } };
  }
  if (registered === true) {
    recordSighting(clean, 'active', 'session');
    return { number: clean, registered: true, ban: 'not_banned', evidence: { probe } };
  }

  // not on WhatsApp (per probe or session) — history disambiguates banned vs never
  const wasActive = wasActiveBefore(clean);
  recordSighting(clean, 'gone', probe ? 'probe' : 'session');

  const ban = wasActive ? 'likely_banned' : 'never_registered';
  if (probe?.verdict === 'throttled' || probe?.verdict === 'old_version' || probe?.verdict === 'bad_param') {
    // probe didn't produce a usable verdict; fall back to session + history
    if (registered === null && !wasActive) {
      return { number: clean, registered, ban: 'unknown', evidence: { probe } };
    }
  }
  return { number: clean, registered: registered ?? false, ban, evidence: { probe, wasActive } };
}
