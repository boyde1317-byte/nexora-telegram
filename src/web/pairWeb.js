/**
 * pairWeb.js — free self-service web pairing for the NEXORA Telegram port.
 *
 * Same idea as the `tg:` pseudo-JID: the web is just another surface over
 * the existing session engine. Two modes (WEB_PAIR_MODE):
 *
 *   'free' (default) — instant: visitor enters a number, pairSession()
 *      spawns with NO notifyJid, WhatsApp issues the code, and it is shown
 *      ONLY on the page to the holder of a one-time polling token. Honors
 *      the fleet cap and relays pairSession's errors verbatim.
 *
 *   'request' — gated: the visitor's request files into the SHARED approval
 *      queue (the same one Telegram /pair fallback and WhatsApp .pair feed):
 *      an Approve/Deny card lands with the Telegram admins and shows in
 *      .pairrequests. The request's dmJid is `web:<token>` — a pseudo-JID
 *      like `tg:<chat_id>`: notifyMain can't deliver to it (fails silently,
 *      by design), so the pairing code never leaves the server; once an
 *      admin approves, pairSession(phone, { notifyJid: 'web:<token>' })
 *      starts, the code lands in the session entry, and the page's poller
 *      picks it up via getPairingState().
 *
 * Abuse controls (mounted OUTSIDE the general /api limiter, stricter ones):
 *   - POST start: 3 attempts / IP / 10 min; status: 150 polls / IP / 10 min
 *   - Polling tokens are random UUIDs, TTL 10 min, single phone each
 *   - MAX_EXTRA_SESSIONS caps the fleet; the page shows free slots up-front
 *   - WEB_PAIR_ENABLED=false kills the whole feature instantly
 *
 * Visibility: on a completed link, notifyStatus still mirrors the lifecycle
 * alert to the Telegram admins and the WhatsApp super owner — a web pair is
 * never invisible to the operator.
 */
import express from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { config } from '../../config/index.js';
import brand from '../../config/brand.js';
import {
  MAX_EXTRA_SESSIONS,
  listSessions,
  getPairingState,
  notifyStatus,
  pairSession,
  addPairRequest,
  peekPairRequest,
} from '../core/sessionManager.js';

const router = express.Router();

// ── Rate limits (stricter than the general API limiter) ─────────────────────
const startLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many pairing attempts. Wait a few minutes and try again.' },
});

const pollLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 150, // 3s polling for ~5 min per attempt, with slack for a retry
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Reload the page and try again.' },
});

// ── Polling tokens: token → { phone, ts, mode } ──────────────────────────────
const webPairs = new Map();
const TOKEN_TTL_MS = 10 * 60 * 1000;

function pruneTokens() {
  const now = Date.now();
  for (const [t, rec] of webPairs) {
    if (now - rec.ts > TOKEN_TTL_MS) webPairs.delete(t);
  }
}

// ── API: slots + mode (drives the page copy) ─────────────────────────────────
router.get('/pair/api/slots', (req, res) => {
  if (!config.webPair.enabled) return res.json({ enabled: false, mode: 'off', used: 0, max: 0, free: 0 });
  const used = listSessions().filter((s) => s.active || s.status === 'reconnecting').length;
  res.json({
    enabled: true,
    mode: config.webPair.mode === 'request' ? 'request' : 'free',
    used,
    max: MAX_EXTRA_SESSIONS,
    free: Math.max(0, MAX_EXTRA_SESSIONS - used),
  });
});

// ── API: start a pairing (free) or file a request (request mode) ──────────────
router.post('/pair/api/start', startLimiter, async (req, res) => {
  if (!config.webPair.enabled) {
    return res.status(503).json({ error: 'Web pairing is currently disabled by the operator.' });
  }
  pruneTokens();

  const phone = String(req.body?.phone || '').replace(/[^0-9]/g, '');
  if (phone.length < 7 || phone.length > 15) {
    return res.status(400).json({ error: 'Enter your full number WITH the country code — digits only. Example: 2335XXXXXXXX.' });
  }

  const token = crypto.randomUUID();
  const mode = config.webPair.mode === 'request' ? 'request' : 'free';

  try {
    if (mode === 'request') {
      // Files into the SAME queue Telegram /pair fallback and WhatsApp .pair
      // use — admins get the Approve/Deny card, .pairrequests lists it.
      // dmJid 'web:<token>': deliverable to nobody (by design) — the code
      // reaches the visitor only through the token-bound status endpoint.
      addPairRequest(phone, { dmJid: `web:${token}`, chatJid: null, name: 'Web pairing page' });
      // Ping the admins the same way the WhatsApp .pair flow does: super
      // owner DM + Telegram mirror (notifyStatus handles both surfaces and
      // never throws; the queue is shared, so /pairapprove and .pairapprove
      // both work on it).
      notifyStatus(null,
        `📶 *PAIRING REQUEST (web)*\n\n` +
        `Number: +${phone}\n` +
        `Requested by: Web pairing page\n\n` +
        `Approve: .pairapprove ${phone} · Deny: .pairdeny ${phone}\n` +
        `Requests expire after ~15 minutes.`);
    } else {
      // Instant: no notifyJid → the code never goes to WhatsApp/Telegram,
      // only to this visitor via their polling token.
      await pairSession(phone, { pairedBy: 'web' });
    }
  } catch (err) {
    return res.status(409).json({ error: err.message || 'Pairing could not be started. Try again.' });
  }

  webPairs.set(token, { phone, ts: Date.now(), mode });
  res.json({ token, phone, mode });
});

// ── API: poll pairing state ──────────────────────────────────────────────────
router.get('/pair/api/status', pollLimiter, (req, res) => {
  pruneTokens();
  const token = String(req.query.token || '');
  const rec = webPairs.get(token);
  if (!rec) {
    return res.status(404).json({ phase: 'expired', error: 'This pairing session expired. Start again.' });
  }

  // Request mode: still queued behind admin approval?
  if (rec.mode === 'request' && peekPairRequest(rec.phone)) {
    return res.json({ phase: 'pending', phone: rec.phone });
  }

  const s = getPairingState(rec.phone);
  if (!s) {
    // Request mode: the queue entry is gone and no session exists → denied
    // or expired (~15 min TTL). In free mode this is just "still starting".
    if (rec.mode === 'request') {
      return res.json({ phase: 'denied', phone: rec.phone, error: 'Your request was declined or expired.' });
    }
    return res.json({ phase: 'starting' });
  }

  let phase;
  switch (s.status) {
    case 'online':          phase = 'linked'; break;      // fully online
    case 'reconnecting':     phase = 'finishing'; break;   // code accepted, login completing (515 resume)
    case 'awaiting_code':    phase = s.pairingCode ? 'code' : 'starting'; break;
    case 'failed':          phase = 'failed'; break;
    default:                phase = 'starting'; break;    // starting | retrying (fresh code auto-issued)
  }

  res.json({
    phase,
    code: s.pairingCode,
    phone: s.phone,
    name: s.name,
    error: s.lastError,
  });
});

// ── The page ─────────────────────────────────────────────────────────────────
router.get('/pair', (req, res) => {
  if (!config.webPair.enabled) {
    res.status(503).send('<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + brand.name + '</title></head><body style="font-family:sans-serif;background:#0c0f12;color:#f1f5f9;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><p>Web pairing is currently disabled by the operator.</p></body></html>');
    return;
  }
  res.setHeader('Content-Type', 'text/html');
  res.send(pairPage());
});

function pairPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${brand.name} — Free WhatsApp Pairing</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #0c0f12; color: #f1f5f9;
    min-height: 100vh; display: flex; flex-direction: column;
    align-items: center; padding: 1.5rem 1rem 3rem;
  }
  .wrap { width: 100%; max-width: 460px; }
  .logo { text-align: center; margin-bottom: 1.2rem; }
  .logo h1 { color: #25d366; font-size: 1.7rem; font-weight: 800; letter-spacing: 0.5px; }
  .logo p { color: #94a3b8; font-size: 0.95rem; margin-top: 0.3rem; }
  .slots {
    text-align: center; margin: 0 auto 1.2rem; display: table;
    background: #1b2622; color: #10b981; border: 1px solid #065f46;
    padding: 0.35rem 1rem; border-radius: 50px; font-size: 0.85rem; font-weight: 600;
  }
  .slots.full { background: #2b1b1b; color: #ef4444; border-color: #7f1d1d; }
  .card {
    background: #171d24; border: 1px solid #2d3748; border-radius: 14px;
    padding: 1.5rem; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5);
  }
  .steps { list-style: none; margin-bottom: 1.2rem; }
  .steps li {
    color: #cbd5e1; font-size: 0.92rem; line-height: 1.5;
    padding-left: 1.6rem; position: relative; margin-bottom: 0.55rem;
  }
  .steps li::before {
    content: attr(data-n); position: absolute; left: 0; top: 0;
    color: #25d366; font-weight: 700; font-size: 0.9rem;
  }
  label { display: block; color: #94a3b8; font-size: 0.85rem; margin-bottom: 0.4rem; font-weight: 600; }
  input[type=tel] {
    width: 100%; padding: 0.85rem 1rem; font-size: 1.1rem;
    background: #0c0f12; color: #f1f5f9; border: 1px solid #2d3748;
    border-radius: 10px; outline: none; letter-spacing: 1px;
  }
  input[type=tel]:focus { border-color: #25d366; }
  .hint { color: #64748b; font-size: 0.78rem; margin-top: 0.4rem; }
  button {
    width: 100%; margin-top: 1rem; padding: 0.85rem; font-size: 1rem; font-weight: 700;
    color: #06130a; background: #25d366; border: none; border-radius: 10px;
    cursor: pointer;
  }
  button:hover { background: #22c15e; }
  button:disabled { background: #1f2937; color: #64748b; cursor: not-allowed; }
  .hidden { display: none; }
  .msg { margin-top: 0.8rem; font-size: 0.85rem; line-height: 1.5; }
  .msg.err { color: #f87171; }
  .msg.ok { color: #34d399; }

  .code-box { text-align: center; margin: 1.2rem 0; }
  .code {
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-size: 2.1rem; font-weight: 800; letter-spacing: 3px; color: #25d366;
    background: #0c0f12; border: 1px dashed #065f46; border-radius: 12px;
    padding: 1rem 0.5rem; user-select: all;
  }
  .countdown { color: #94a3b8; font-size: 0.85rem; margin-top: 0.6rem; }
  .countdown.warn { color: #fbbf24; }
  .copy { width: 100%; margin-top: 0.8rem; padding: 0.7rem; font-size: 0.95rem; }
  .spinner {
    width: 42px; height: 42px; margin: 1rem auto 0.8rem;
    border: 4px solid #2d3748; border-top-color: #25d366; border-radius: 50%;
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .phase-title { text-align: center; font-size: 1.1rem; font-weight: 700; margin-bottom: 0.3rem; }
  .phase-sub { text-align: center; color: #94a3b8; font-size: 0.88rem; line-height: 1.5; }
  .bigcheck { text-align: center; font-size: 3rem; margin-bottom: 0.4rem; }
  .success-num { text-align: center; color: #34d399; font-weight: 700; font-size: 1.05rem; margin: 0.5rem 0 1rem; }
  .next { color: #cbd5e1; font-size: 0.88rem; line-height: 1.6; background: #0c0f12;
          border-radius: 10px; padding: 0.9rem 1rem; border: 1px solid #2d3748; }
  .footer { text-align: center; color: #475569; font-size: 0.78rem; margin-top: 1.6rem; line-height: 1.6; }
</style>
</head>
<body>
<div class="wrap">
  <div class="logo">
    <h1>${brand.name}</h1>
    <p>Pair your WhatsApp — <strong>free</strong>, in under a minute. No installation needed.</p>
  </div>
  <div class="slots" id="slots">Checking free slots…</div>

  <div class="card" id="card-input">
    <ol class="steps" id="steps">
      <li data-n="1">Enter your WhatsApp number below (with country code).</li>
      <li data-n="2">We show you an 8-digit pairing code.</li>
      <li data-n="3">On your phone: <b>WhatsApp → Settings → Linked Devices → Link a Device</b>, then tap <b>Link with phone number instead</b> and enter the code.</li>
    </ol>
    <label for="phone">Your WhatsApp number</label>
    <input id="phone" type="tel" inputmode="numeric" placeholder="e.g. 2335XXXXXXXX" autocomplete="off">
    <p class="hint">Digits only — start with your country code. No +, spaces or dashes.</p>
    <button id="btn-start">Get my pairing code</button>
    <p class="msg" id="msg-input"></p>
  </div>

  <div class="card hidden" id="card-progress">
    <div class="spinner" id="spin"></div>
    <p class="phase-title" id="prog-title">Connecting to WhatsApp…</p>
    <p class="phase-sub" id="prog-sub">This usually takes 5–15 seconds.</p>
    <div class="code-box hidden" id="code-box">
      <div class="code" id="code">••••-••••</div>
      <p class="countdown" id="countdown">Code expires in 3:00</p>
      <button class="copy" id="btn-copy">📋 Copy code</button>
    </div>
    <p class="msg" id="msg-progress"></p>
    <button class="hidden" id="btn-retry">Try again</button>
  </div>

  <div class="card hidden" id="card-success">
    <div class="bigcheck">✅</div>
    <p class="phase-title">You're linked!</p>
    <p class="success-num" id="success-num"></p>
    <div class="next">
      Your number is now running <b>${brand.name}</b> as its own bot. Try your first command:
      send <b>.menu</b> in any group you're in, or in a chat with yourself
      (Message Yourself). Commands start with <b>.</b> <b>!</b> or <b>/</b>.
    </div>
  </div>

  <p class="footer">${brand.name} v${brand.version} • Free web pairing<br>Only pair a number <b>you own</b>. Pairing someone else's number without consent may get the session banned.</p>
</div>

<script>
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var phone = '', token = null, pollTimer = null, countTimer = null, deadline = 0, lastPhase = '';

  function show(card) {
    ['card-input', 'card-progress', 'card-success'].forEach(function (c) {
      $(c).classList.toggle('hidden', c !== card);
    });
  }
  function say(id, text, isErr) {
    var el = $(id); el.textContent = text || '';
    el.className = 'msg' + (isErr ? ' err' : ' ok');
  }

  // Free-slots banner + mode copy
  fetch('/pair/api/slots').then(function (r) { return r.json(); }).then(function (d) {
    var el = $('slots');
    if (!d.enabled) { el.textContent = 'Web pairing is disabled'; el.classList.add('full'); return; }
    el.textContent = '🟢 ' + d.free + ' of ' + d.max + ' pairing slots free';
    if (d.free === 0) {
      el.textContent = '🔴 All ' + d.max + ' pairing slots are full right now';
      el.classList.add('full');
    }
    if (d.mode === 'request') {
      var steps = $('steps');
      steps.children[1].innerHTML = 'An admin reviews your request — usually within minutes. Keep this page open.';
      steps.children[2].innerHTML = 'Once approved, your 8-digit code appears right here.';
      var li = document.createElement('li');
      li.setAttribute('data-n', '4');
      li.innerHTML = 'On your phone: <b>WhatsApp → Settings → Linked Devices → Link a Device</b>, then tap <b>Link with phone number instead</b> and enter the code.';
      steps.appendChild(li);
      $('btn-start').textContent = 'Request my pairing code';
    }
  }).catch(function () {});

  $('btn-start').addEventListener('click', startPair);
  $('phone').addEventListener('keydown', function (e) { if (e.key === 'Enter') startPair(); });
  $('btn-copy').addEventListener('click', function () {
    var code = $('code').textContent;
    if (navigator.clipboard) navigator.clipboard.writeText(code.replace(/[^0-9]/g, ''));
    this.textContent = '✅ Copied!';
    var b = this; setTimeout(function () { b.textContent = '📋 Copy code'; }, 1600);
  });
  $('btn-retry').addEventListener('click', function () {
    $('btn-retry').classList.add('hidden'); startPair();
  });

  function startPair() {
    var raw = $('phone').value;
    var digits = raw.replace(/[^0-9]/g, '');
    if (digits.length < 7 || digits.length > 15) {
      say('msg-input', 'Enter your full number with the country code — digits only. Example: 2335XXXXXXXX.', true);
      return;
    }
    phone = digits;
    say('msg-input', '');
    $('btn-start').disabled = true;
    $('btn-start').textContent = 'Starting…';

    fetch('/pair/api/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phone })
    }).then(function (r) {
      return r.json().then(function (d) { return { ok: r.ok, d: d }; });
    }).then(function (res) {
      if (!res.ok) {
        $('btn-start').disabled = false;
        $('btn-start').textContent = 'Get my pairing code';
        say('msg-input', res.d.error || 'Something went wrong. Try again.', true);
        return;
      }
      token = res.d.token;
      show('card-progress');
      setPhase('starting');
      pollStatus();
    }).catch(function () {
      $('btn-start').disabled = false;
      $('btn-start').textContent = 'Get my pairing code';
      say('msg-input', 'Network error — check your connection and try again.', true);
    });
  }

  function setPhase(phase, data) {
    if (phase === lastPhase && phase !== 'code') return;
    lastPhase = phase;
    var spin = $('spin'), title = $('prog-title'), sub = $('prog-sub'),
        codeBox = $('code-box');

    if (phase === 'starting' || phase === 'expired') {
      spin.style.display = 'block';
      codeBox.classList.add('hidden');
      title.textContent = 'Connecting to WhatsApp…';
      sub.textContent = 'This usually takes 5–15 seconds.';
      if (phase === 'expired') {
        title.textContent = 'Session expired';
        sub.textContent = 'Start again to get a fresh code.';
        spin.style.display = 'none';
        $('btn-retry').classList.remove('hidden');
      }
    } else if (phase === 'pending') {
      spin.style.display = 'block';
      codeBox.classList.add('hidden');
      title.textContent = 'Request sent — waiting for approval';
      sub.textContent = 'An admin has been notified. This page updates automatically the moment your request is approved (requests expire after ~15 minutes).';
    } else if (phase === 'denied') {
      spin.style.display = 'none';
      codeBox.classList.add('hidden');
      title.textContent = 'Request not approved';
      sub.textContent = (data && data.error) ? data.error : 'Your request was declined or expired.';
      $('btn-retry').classList.remove('hidden');
    } else if (phase === 'code') {
      spin.style.display = 'none';
      codeBox.classList.remove('hidden');
      title.textContent = 'Your pairing code';
      sub.innerHTML = 'On your phone now:<br><b>WhatsApp → Settings → Linked Devices → Link a Device</b><br>then <b>Link with phone number instead</b> and type the code.';
      var code = String(data.code || '');
      if (code) $('code').textContent = code.slice(0, 4) + '-' + code.slice(4);
      if (!deadline) { deadline = Date.now() + 3 * 60 * 1000; startCountdown(); }
    } else if (phase === 'finishing') {
      spin.style.display = 'block';
      codeBox.classList.add('hidden');
      title.textContent = 'Code accepted 🎉';
      sub.textContent = 'Finishing setup — your bot is coming online…';
    } else if (phase === 'linked') {
      clearInterval(pollTimer); clearInterval(countTimer);
      $('success-num').textContent = '+' + phone + (data && data.name ? ' — ' + data.name : '');
      show('card-success');
    } else if (phase === 'failed') {
      spin.style.display = 'none';
      codeBox.classList.add('hidden');
      title.textContent = 'Pairing failed';
      sub.textContent = (data && data.error) ? data.error : 'The code was not entered in time.';
      $('btn-retry').classList.remove('hidden');
      clearInterval(countTimer);
    }
  }

  function startCountdown() {
    countTimer = setInterval(function () {
      var left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      var m = Math.floor(left / 60), s = left % 60;
      var el = $('countdown');
      el.textContent = 'Code expires in ' + m + ':' + (s < 10 ? '0' : '') + s;
      el.classList.toggle('warn', left <= 60);
      if (left === 0) clearInterval(countTimer);
    }, 1000);
  }

  function pollStatus() {
    clearInterval(pollTimer);
    pollTimer = setInterval(function () {
      fetch('/pair/api/status?token=' + encodeURIComponent(token))
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          if (res.d.phase === 'expired') { clearInterval(pollTimer); setPhase('expired'); return; }
          setPhase(res.d.phase, res.d);
        })
        .catch(function () {});
    }, 3000);
  }
})();
</script>
</body>
</html>`;
}

export { router as pairRouter };
