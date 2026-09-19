/**
 * WhatsApp ban-check probe — port of ourin-baileys' checkBanned/requestRegistrationCode
 * (the proven reference implementation) as a self-contained lib, no socket needed.
 *
 * Mechanism: the WhatsApp mobile registration endpoint (v.whatsapp.net/v2/code) is
 * probed with fresh, never-registered creds for the target number. A BANNED number
 * answers with a reason error carrying appeal_token / violation_type /
 * in_app_ban_appeal; a RESTRICTED number answers with custom_block_screen or
 * reason 'blocked'; a clean number returns status 'sent'.
 *
 * Side effect (inherent to this probe method, same as the reference): WhatsApp
 * attempts to SMS an OTP to the number if it is clean/unregistered.
 *
 * Shape returned matches what plugins/owner/checkwa.js expects:
 *   { number, isBanned, isNeedOfficialWa, data: { violation_type,
 *     in_app_ban_appeal, appeal_token } | null, status }
 */
import axios from 'axios';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { initAuthCreds, generateRegistrationId } from 'baileys';
import { parsePhoneNumber } from 'libphonenumber-js';

// ── Constants (structure verbatim from ourin-baileys/lib/Defaults — proven reference) ──
// NOTE (2026-09-14, device-verified): the reference's WA_VERSION '2.25.23.24' is
// now rejected with reason 'old_version'. WhatsApp has moved to year-based app
// versions (26.x), but the /v2/code endpoint still expects the four-part
// '2.<major>.<minor>.<patch>' scheme — verified working format is '2.26.36.74'
// (App Store 26.36.74 mapped back to the four-part scheme). The token secret
// '0a1mLfGUIBVrMKF1RdvLI5lkRBvof6vn0fD2QRSM' remains valid with that version.
const WA_VERSION = '2.26.36.74';
const MOBILE_REGISTRATION_ENDPOINT = 'https://v.whatsapp.net/v2';
const PROBE_TIMEOUT_MS = 15000;
const IOS_UA_VERSION = '18.2';

/** URL-encode exactly like the reference (only - _ ~ are percent-encoded). */
function urlencode(str) {
  return String(str).replace(/-/g, '%2d').replace(/_/g, '%5f').replace(/~/g, '%7e');
}

/**
 * Fresh per-probe creds: the fork's initAuthCreds() lacks the mobile fields,
 * so generate them the same way ourin's initAuthCreds does.
 */
function freshCreds() {
  const creds = initAuthCreds();
  return {
    ...creds,
    deviceId: Buffer.from(uuidv4().replace(/-/g, ''), 'hex').toString('base64url'),
    phoneId: uuidv4(),
    identityId: crypto.randomBytes(20),
    backupToken: crypto.randomBytes(20),
  };
}

/** Build the registration query params — verbatim port of registrationParams(). */
const WA_VERSION_HASH = crypto.createHash('md5').update(WA_VERSION).digest('hex');
const MOBILE_TOKEN = Buffer.from('0a1mLfGUIBVrMKF1RdvLI5lkRBvof6vn0fD2QRSM' + WA_VERSION_HASH);

function registrationParams(params) {
  const e_regid = Buffer.alloc(4);
  e_regid.writeInt32BE(params.registrationId ?? generateRegistrationId());
  const countryCode = params.phoneNumberCountryCode.replace('+', '').trim();
  const nationalNumber = params.phoneNumberNationalNumber.replace(/[/-\s)(]/g, '').trim();
  const bufHexUrl = (buffer) =>
    Buffer.from(buffer).toString('hex').match(/.{1,2}/g).map((b) => `%${b.toLowerCase()}`).join('');

  return {
    cc: countryCode,
    in: nationalNumber,
    Rc: '0',
    lg: 'en',
    lc: 'GB',
    mistyped: '6',
    authkey: Buffer.from(params.noiseKey.public).toString('base64url'),
    e_regid: e_regid.toString('base64url'),
    e_keytype: 'BQ',
    e_ident: Buffer.from(params.signedIdentityKey.public).toString('base64url'),
    e_skey_id: 'AAAA',
    e_skey_val: Buffer.from(params.signedPreKey.keyPair.public).toString('base64url'),
    e_skey_sig: Buffer.from(params.signedPreKey.signature).toString('base64url'),
    fdid: params.phoneId,
    network_ratio_type: '1',
    expid: params.deviceId,
    simnum: '1',
    hasinrc: '1',
    pid: Math.floor(Math.random() * 1000).toString(),
    id: bufHexUrl(params.identityId),
    backup_token: bufHexUrl(params.backupToken),
    // NOTE: the fork's md5() export returns a byte array, not a hex string — use crypto directly
    token: crypto.createHash('md5').update(Buffer.concat([MOBILE_TOKEN, Buffer.from(nationalNumber)])).digest('hex'),
    fraud_checkpoint_code: undefined,
  };
}

/** Fire the /code probe and return the raw response JSON (no throwing — we inspect). */
async function probeCode(params) {
  const query = {
    ...registrationParams(params),
    mcc: `${params.phoneNumberMobileCountryCode}`.padStart(3, '0'),
    mnc: `${params.phoneNumberMobileNetworkCode || '001'}`.padStart(3, '0'),
    sim_mcc: '000',
    sim_mnc: '000',
    method: params.method || 'sms',
    reason: '',
    hasav: '1',
  };
  const qs = Object.entries(query)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `${k}=${urlencode(v)}`)
    .join('&');

  const response = await axios.get(`${MOBILE_REGISTRATION_ENDPOINT}/code?${qs}`, {
    headers: { 'User-Agent': `WhatsApp/${WA_VERSION} iOS/${IOS_UA_VERSION} Device/Apple-iPhone_13` },
    timeout: PROBE_TIMEOUT_MS,
    validateStatus: () => true, // WA returns 4xx with a JSON body for bans — read it
  });
  const data = typeof response.data === 'object' ? response.data : {};
  if (process.env.NEXORA_BANCHECK_DEBUG) {
    console.log('[waBanCheck] probe HTTP', response.status, '| qs:', qs.slice(0, 200), '| body:', JSON.stringify(data).slice(0, 300));
  }
  return data;
}

/**
 * Check whether a WhatsApp number is banned.
 *
 * @param {string} jid Number as digits, '+digits', or a full JID
 * @returns {Promise<{number: string, isBanned: boolean, isNeedOfficialWa: boolean,
 *                    data: {violation_type, in_app_ban_appeal, appeal_token}|null,
 *                    status: 'clean'|'banned'|'restricted'|'unknown'}>}
 */
export async function checkWhatsApp(jid) {
  if (!jid || typeof jid !== 'string') throw new Error('enter jid');

  let phoneNumber = jid.includes('@') ? jid.split('@')[0] : jid;
  phoneNumber = phoneNumber.replace(/[^\d+]/g, '');
  if (phoneNumber.startsWith('0')) phoneNumber = phoneNumber.substring(1);
  if (phoneNumber.startsWith('+')) phoneNumber = phoneNumber.substring(1);
  if (phoneNumber.length < 6) throw new Error('could not parse a valid phone number');

  const parsed = parsePhoneNumber(`+${phoneNumber}`);
  if (!parsed || !parsed.countryCallingCode || !parsed.nationalNumber) {
    throw new Error('could not parse a valid phone number (include the country code)');
  }

  const creds = freshCreds();
  const json = await probeCode({
    ...creds,
    phoneNumber: `+${phoneNumber}`,
    phoneNumberCountryCode: `+${parsed.countryCallingCode}`,
    phoneNumberNationalNumber: parsed.nationalNumber,
    phoneNumberMobileCountryCode: '510',   // verbatim from the reference probe
    phoneNumberMobileNetworkCode: '10',
    method: 'sms',
  });

  const result = {
    number: `+${phoneNumber}`,
    isBanned: false,
    isNeedOfficialWa: false,
    data: null,
    status: 'unknown',
  };

  if (json.appeal_token) {
    result.isBanned = true;
    result.status = 'banned';
    result.data = {
      violation_type: json.violation_type || null,
      in_app_ban_appeal: json.in_app_ban_appeal ?? null,
      appeal_token: json.appeal_token || null,
    };
  } else if (json.custom_block_screen || json.reason === 'blocked') {
    result.isNeedOfficialWa = true;
    result.status = 'restricted';
  } else if (json.reason === 'temporarily_unavailable') {
    // WA throttles the probe aggressively (≈1/hr) — surface the retry window
    result.status = 'unavailable';
    result.retryAfter = json.retry_after || 3600;
  } else if (json.status && ['ok', 'sent'].includes(json.status)) {
    result.status = 'clean';
  } else if (json.reason) {
    result.status = 'unknown';
    result.reason = json.reason;
  }

  return result;
}
