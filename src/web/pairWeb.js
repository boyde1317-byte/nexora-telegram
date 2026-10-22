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

const SOCIALS = [
  {
    name: 'GitHub', sub: 'source & releases', url: 'https://github.com/boyde1317-byte/',
    svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>'
  },
  {
    name: 'WhatsApp Channel', sub: 'updates & tips', url: 'https://whatsapp.com/channel/0029Vb7eSHf42Dcmdd3XA326',
    svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>'
  },
  {
    name: 'Telegram', sub: 'community & support', url: 'https://t.me/NexoraConnect3Crbot',
    svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.272c.016.077.038.26.02.402-.19 1.499-1.009 5.135-1.428 6.811-.176.744-.522.99-.857 1.017-.728.067-1.282-.48-1.988-.94-1.104-.724-1.728-1.176-2.802-1.883-1.24-.817-.436-1.266.27-1.998.186-.192 3.367-3.084 3.434-3.349a.255.255 0 00.006-.121c-.006-.04-.055-.028-.127-.016-.303.07-4.096 2.583-4.296 2.723-.715.46-1.105.512-1.651.31-.538-.2-.901-.292-1.204-.46-.478-.256-.184-.558.105-.862.364-.384 3.163-3.03 3.59-3.442z"/></svg>'
  },
  {
    name: 'WhatsApp DM', sub: 'talk to the owner', url: 'https://wa.me/233533416608',
    svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3C6.48 3 2 6.92 2 11.75c0 2.36 1.09 4.5 2.85 6.05-.1.83-.42 2.02-1.35 2.9 1.5-.2 2.72-.83 3.5-1.33 1.5.5 3.2.78 5 .78 5.52 0 10-3.92 10-8.4S17.52 3 12 3z"/></svg>'
  }
];

function pairPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${brand.name} — Pair WhatsApp in 60 seconds</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #05070d; --ink: #eaf2f7; --mut: #8b96a8; --dim: #5c6877;
    --em: #22e584; --em2: #2dd4bf; --card: rgba(255,255,255,.035);
    --line: rgba(255,255,255,.09); --danger: #f87171;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: var(--bg); color: var(--ink);
    min-height: 100vh; display: flex; flex-direction: column; align-items: center;
    padding: 1.4rem 1rem 2.5rem; position: relative; overflow-x: hidden;
  }

  /* ── atmosphere ──────────────────────────────────────────── */
  .bg { position: fixed; inset: 0; z-index: -1; overflow: hidden; pointer-events: none; }
  .orb { position: absolute; border-radius: 50%; filter: blur(110px); opacity: .55; }
  .orb.a { width: 480px; height: 480px; background: #0e3b2e; top: -160px; left: -120px; animation: drift 14s ease-in-out infinite alternate; }
  .orb.b { width: 420px; height: 420px; background: #12253f; bottom: -140px; right: -120px; animation: drift 17s ease-in-out infinite alternate-reverse; }
  .grid { position: absolute; inset: 0;
    background-image: linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px);
    background-size: 44px 44px;
    mask-image: radial-gradient(ellipse 90% 60% at 50% 0%, #000 30%, transparent 75%);
    -webkit-mask-image: radial-gradient(ellipse 90% 60% at 50% 0%, #000 30%, transparent 75%);
  }
  @keyframes drift { to { transform: translate(40px, 26px) scale(1.06); } }

  .wrap { width: 100%; max-width: 460px; }

  /* ── top bar ─────────────────────────────────────────────── */
  nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2rem; }
  .brand { display: flex; align-items: center; gap: .55rem; font-family: "Space Grotesk", sans-serif; font-weight: 700; font-size: 1.05rem; letter-spacing: .06em; }
  .brand svg { flex: 0 0 auto; }
  .brand span { color: var(--mut); font-weight: 500; }
  .pulse { display: inline-flex; align-items: center; gap: .4rem; font-size: .72rem; color: var(--mut);
            border: 1px solid var(--line); padding: .28rem .7rem; border-radius: 999px; }
  .pulse i { width: 7px; height: 7px; border-radius: 50%; background: var(--em); box-shadow: 0 0 8px var(--em); animation: beat 2s infinite; }
  @keyframes beat { 50% { opacity: .4; } }

  /* ── hero ────────────────────────────────────────────────── */
  .hero { text-align: left; margin-bottom: 1.6rem; }
  .hero h1 {
    font-family: "Space Grotesk", sans-serif; font-size: 2.05rem; line-height: 1.14;
    font-weight: 700; letter-spacing: -.02em;
  }
  .hero h1 em { font-style: normal; background: linear-gradient(90deg, var(--em), var(--em2));
                -webkit-background-clip: text; background-clip: text; color: transparent; }
  .hero p { color: var(--mut); font-size: .95rem; margin-top: .6rem; line-height: 1.55; max-width: 38ch; }
  .stats { display: flex; gap: .55rem; margin-top: 1.1rem; flex-wrap: wrap; }
  .chip { font-size: .74rem; font-weight: 600; color: #b9c5d4; border: 1px solid var(--line);
          background: var(--card); padding: .38rem .8rem; border-radius: 999px; }
  .chip b { color: var(--em); font-weight: 700; }
  .chip.full { color: var(--danger); border-color: rgba(248,113,113,.35); }
  .chip.full b { color: var(--danger); }

  /* ── cards ───────────────────────────────────────────────── */
  .card {
    background: var(--card); border: 1px solid var(--line); border-radius: 18px;
    padding: 1.5rem; backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
    box-shadow: 0 24px 48px -24px rgba(0,0,0,.6);
  }
  .hidden { display: none !important; }

  /* steps */
  .steps { list-style: none; display: flex; flex-direction: column; gap: .8rem; margin-bottom: 1.35rem; }
  .steps li { display: flex; gap: .8rem; align-items: flex-start; color: #c4cfdc; font-size: .87rem; line-height: 1.5; }
  .steps li::before {
    content: attr(data-n); flex: 0 0 auto; width: 26px; height: 26px; border-radius: 9px;
    display: grid; place-items: center; font-family: "Space Grotesk", sans-serif;
    font-size: .8rem; font-weight: 700; color: var(--em);
    background: rgba(34,229,132,.09); border: 1px solid rgba(34,229,132,.25);
  }
  .steps b { color: var(--ink); }

  label { display: block; color: var(--mut); font-size: .78rem; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; margin-bottom: .5rem; }
  .field { position: relative; }
  .field .cc { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--em); font-weight: 700; font-size: 1rem; }
  input[type=tel] {
    width: 100%; padding: .95rem 1rem .95rem 2.3rem; font-size: 1.15rem; font-family: "JetBrains Mono", monospace;
    background: rgba(0,0,0,.35); color: var(--ink); border: 1px solid var(--line);
    border-radius: 13px; outline: none; letter-spacing: 1px; transition: border-color .2s, box-shadow .2s;
  }
  input[type=tel]::placeholder { color: #3f4a5c; letter-spacing: 1px; }
  input[type=tel]:focus { border-color: var(--em); box-shadow: 0 0 0 3px rgba(34,229,132,.15); }
  .hint { color: #5c6877; font-size: .75rem; margin-top: .45rem; }

  button.cta {
    width: 100%; margin-top: 1.1rem; padding: .95rem; font-size: 1rem; font-weight: 700;
    font-family: "Space Grotesk", sans-serif; letter-spacing: .01em;
    color: #04170c; border: none; border-radius: 13px; cursor: pointer;
    background: linear-gradient(180deg, var(--em), #15c673);
    box-shadow: 0 8px 24px -8px rgba(34,229,132,.55); transition: transform .12s, box-shadow .2s, filter .2s;
  }
  button.cta:hover { filter: brightness(1.06); }
  button.cta:active { transform: scale(.985); }
  button.cta:disabled { filter: saturate(.4) brightness(.7); cursor: not-allowed; box-shadow: none; }
  button.ghost {
    width: 100%; margin-top: 1rem; padding: .8rem; font-size: .9rem; font-weight: 600;
    color: var(--ink); background: transparent; border: 1px solid var(--line);
    border-radius: 12px; cursor: pointer; transition: border-color .2s;
  }
  button.ghost:hover { border-color: #7c8899; }

  .msg { margin-top: .8rem; font-size: .83rem; line-height: 1.5; }
  .msg.err { color: var(--danger); }
  .msg.ok { color: #34d399; }

  /* ── progress card ───────────────────────────────────────── */
  .stepper { display: flex; align-items: center; gap: 0; margin-bottom: 1.4rem; }
  .st { flex: 1; display: flex; flex-direction: column; align-items: center; gap: .4rem; position: relative; }
  .st .dot { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center;
             font-size: .72rem; font-weight: 700; font-family: "Space Grotesk", sans-serif;
             background: rgba(255,255,255,.05); border: 1px solid var(--line); color: var(--mut); transition: all .3s; }
  .st span { font-size: .68rem; color: var(--dim); letter-spacing: .03em; transition: color .3s; }
  .st::after { content: ""; position: absolute; top: 15px; left: calc(50% + 22px); width: calc(100% - 44px); height: 1px;
               background: var(--line); }
  .st:last-child::after { display: none; }
  .st.on .dot { background: rgba(34,229,132,.12); border-color: var(--em); color: var(--em); box-shadow: 0 0 14px rgba(34,229,132,.35); }
  .st.on span { color: #c4cfdc; }
  .st.done .dot { background: rgba(34,229,132,.12); border-color: rgba(34,229,132,.4); color: var(--em); }
  .st.done .dot::before { content: "✓"; }
  .st.done .dot i, .st.on .dot i { display: none; }
  .st.done span { color: var(--mut); }

  .orb-spinner { width: 54px; height: 54px; margin: .4rem auto 1.1rem; border-radius: 50%;
    background: conic-gradient(from 0deg, transparent 12%, var(--em) 65%, var(--em2));
    mask: radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 4px));
    -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 4px));
    animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .phase-title { text-align: center; font-family: "Space Grotesk", sans-serif; font-size: 1.2rem; font-weight: 700; }
  .phase-sub { text-align: center; color: var(--mut); font-size: .84rem; line-height: 1.55; margin-top: .35rem; }

  .code-box { text-align: center; margin-top: 1.3rem; }
  .code { display: flex; justify-content: center; gap: 7px; margin: 0 auto; }
  .digit {
    width: 38px; height: 48px; display: grid; place-items: center;
    font-family: "JetBrains Mono", monospace; font-size: 1.5rem; font-weight: 700; color: var(--em);
    background: rgba(0,0,0,.45); border: 1px solid rgba(34,229,132,.3); border-radius: 11px;
    animation: pop .35s cubic-bezier(.2,1.4,.4,1) backwards;
  }
  .digit.gap { margin-left: 12px; }
  @keyframes pop { from { transform: scale(.55); opacity: 0; } }
  .countwrap { width: 60%; margin: .9rem auto 0; }
  .bar { height: 4px; background: rgba(255,255,255,.08); border-radius: 99px; overflow: hidden; }
  .bar i { display: block; height: 100%; width: 100%; background: linear-gradient(90deg, var(--em), var(--em2)); border-radius: 99px; transition: width .25s linear; }
  .bar i.warn { background: linear-gradient(90deg, #fbbf24, #f59e0b); }
  .countdown { color: var(--mut); font-size: .74rem; margin-top: .45rem; }
  .countdown.warn { color: #fbbf24; }
  button.copy { margin-top: 1rem; }

  /* ── success ─────────────────────────────────────────────── */
  .bigcheck { display: grid; place-items: center; margin-bottom: .8rem; }
  .bigcheck svg circle { stroke: var(--em); stroke-dasharray: 76; stroke-dashoffset: 76; animation: draw .5s .1s ease forwards; }
  .bigcheck svg path { stroke: var(--em); stroke-dasharray: 30; stroke-dashoffset: 30; animation: draw .35s .55s ease forwards; }
  @keyframes draw { to { stroke-dashoffset: 0; } }
  .success-num { text-align: center; color: var(--em); font-weight: 700; font-size: 1.02rem; margin: .4rem 0 1rem; font-family: "JetBrains Mono", monospace; }
  .next { color: #c4cfdc; font-size: .86rem; line-height: 1.65; background: rgba(0,0,0,.3);
          border-radius: 12px; padding: 1rem 1.1rem; border: 1px solid var(--line); }
  .next b { color: var(--ink); }
  .kbd { font-family: "JetBrains Mono", monospace; background: rgba(255,255,255,.07); border: 1px solid var(--line);
         border-radius: 6px; padding: .06rem .45rem; font-size: .84em; color: var(--em); }
  canvas.confetti { position: fixed; inset: 0; pointer-events: none; z-index: 50; }

  /* ── connect ─────────────────────────────────────────────── */
  .connect { margin-top: 1.5rem; }
  .connect-k { font-size: .72rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--dim); margin-bottom: .6rem; }
  .tiles { display: grid; grid-template-columns: 1fr 1fr; gap: .6rem; }
  .tile {
    display: flex; flex-direction: column; align-items: flex-start; padding: .85rem .95rem;
    background: var(--card); border: 1px solid var(--line); border-radius: 14px;
    text-decoration: none; transition: border-color .2s, transform .15s;
  }
  .tile:hover { border-color: rgba(34,229,132,.45); transform: translateY(-1px); }
  .tile svg { width: 18px; height: 18px; color: #b9c5d4; margin-bottom: .4rem; }
  .t-name { font-size: .82rem; font-weight: 600; color: var(--ink); }
  .t-sub { font-size: .7rem; color: var(--dim); }

  .footer { text-align: center; color: #47505f; font-size: .74rem; margin-top: 1.8rem; line-height: 1.7; }
  .footer b { color: #6b7686; }
</style>
</head>
<body>
<div class="bg"><div class="orb a"></div><div class="orb b"></div><div class="grid"></div></div>
<div class="wrap">
  <nav>
    <div class="brand">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M4 20V4l16 8-16 8z" fill="url(#g)"/><defs>
        <linearGradient id="g" x1="0" y1="0" x2="24" y2="24"><stop stop-color="#22e584"/><stop offset="1" stop-color="#2dd4bf"/></linearGradient></defs>
      </svg>
      ${brand.name}<span>MD</span>
    </div>
    <span class="pulse"><i></i>all systems live</span>
  </nav>

  <header class="hero">
    <h1>Pair WhatsApp<br><em>in 60 seconds.</em></h1>
    <p>No installs, no QR scanning, no tech skills. You type a number, we hand you the code.</p>
    <div class="stats">
      <span class="chip" id="slots">checking slots…</span>
      <span class="chip"><b>100%</b> free</span>
      <span class="chip">codes never expire your session</span>
    </div>
  </header>

  <div class="card" id="card-input">
    <ol class="steps" id="steps">
      <li data-n="1"><span>Enter your WhatsApp number below — with the country code.</span></li>
      <li data-n="2"><span>We show you an <b>8-digit code</b> instantly.</span></li>
      <li data-n="3"><span>On your phone: <b>WhatsApp → Linked devices → Link a device</b>, then <b>Link with phone number instead</b> and type the code.</span></li>
    </ol>
    <label for="phone">Your WhatsApp number</label>
    <div class="field">
      <span class="cc">+</span>
      <input id="phone" type="tel" inputmode="numeric" placeholder="233 5X XXX XXXX" autocomplete="off">
    </div>
    <p class="hint">Digits only, starting with your country code. No +, spaces or dashes.</p>
    <button class="cta" id="btn-start">Get my pairing code</button>
    <p class="msg" id="msg-input"></p>
  </div>

  <div class="card hidden" id="card-progress">
    <div class="stepper">
      <div class="st on" id="st1"><div class="dot"><i>1</i></div><span>number</span></div>
      <div class="st" id="st2"><div class="dot"><i>2</i></div><span>code</span></div>
      <div class="st" id="st3"><div class="dot"><i>3</i></div><span>linked</span></div>
    </div>
    <div class="orb-spinner" id="spin"></div>
    <p class="phase-title" id="prog-title">Connecting to WhatsApp…</p>
    <p class="phase-sub" id="prog-sub">This usually takes 5–15 seconds.</p>
    <div class="code-box hidden" id="code-box">
      <div class="code" id="code"></div>
      <div class="countwrap">
        <div class="bar"><i id="bar-fill"></i></div>
      </div>
      <p class="countdown" id="countdown">code expires in 3:00</p>
      <button class="cta copy" id="btn-copy">Copy code</button>
    </div>
    <p class="msg" id="msg-progress"></p>
    <button class="ghost hidden" id="btn-retry">Try again</button>
  </div>

  <div class="card hidden" id="card-success">
    <div class="bigcheck">
      <svg width="64" height="64" viewBox="0 0 26 26" fill="none" stroke-width="2">
        <circle cx="13" cy="13" r="12"/>
        <path d="M7.5 13.5l4 4 7-8.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
    <p class="phase-title">You're linked.</p>
    <p class="success-num" id="success-num"></p>
    <div class="next">
      Your number is now running <b>${brand.name}</b> as its own bot. Try it now:
      send <span class="kbd">.menu</span> in any group you're in, or in a chat with yourself.
      Commands start with <span class="kbd">.</span> <span class="kbd">!</span> or <span class="kbd">/</span>.
    </div>
  </div>

  <div class="connect">
    <p class="connect-k">Stay connected</p>
    <div class="tiles">
      ${SOCIALS.map(function (s) { return `
      <a class="tile" href="${s.url}" target="_blank" rel="noopener">
        ${s.svg}
        <span class="t-name">${s.name}</span>
        <span class="t-sub">${s.sub}</span>
      </a>`; }).join('')}
    </div>
  </div>

  <p class="footer">${brand.name} v${brand.version} • free web pairing<br>
  Only pair a number <b>you own</b> — pairing someone else's number without consent can get the session banned.</p>
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
  function setStep(n) {
    [1, 2, 3].forEach(function (i) {
      var el = $('st' + i);
      el.classList.toggle('done', i < n);
      el.classList.toggle('on', i === n);
    });
  }
  function renderCode(code) {
    var box = $('code'); box.innerHTML = '';
    String(code).split('').forEach(function (ch, i) {
      var d = document.createElement('span');
      d.className = 'digit' + (i === 4 ? ' gap' : '');
      d.textContent = ch;
      d.style.animationDelay = (i * 55) + 'ms';
      box.appendChild(d);
    });
  }
  function confetti() {
    var c = document.createElement('canvas');
    c.className = 'confetti'; document.body.appendChild(c);
    var ctx = c.getContext('2d');
    c.width = window.innerWidth; c.height = window.innerHeight;
    var colors = ['#22e584', '#2dd4bf', '#a7f3d0', '#ffffff', '#34d399'];
    var parts = [];
    for (var i = 0; i < 90; i++) parts.push({
      x: c.width / 2 + (Math.random() - .5) * 90, y: c.height * .32,
      vx: (Math.random() - .5) * 9, vy: -Math.random() * 10 - 3,
      s: Math.random() * 5 + 3, r: Math.random() * Math.PI, vr: (Math.random() - .5) * .3,
      col: colors[i % colors.length]
    });
    var t0 = performance.now();
    (function frame(t) {
      ctx.clearRect(0, 0, c.width, c.height);
      parts.forEach(function (p) {
        p.x += p.vx; p.vy += .25; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.col; ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * .62);
        ctx.restore();
      });
      if (t - t0 < 2600) requestAnimationFrame(frame); else c.remove();
    })(t0);
  }

  fetch('/pair/api/slots').then(function (r) { return r.json(); }).then(function (d) {
    var el = $('slots');
    if (!d.enabled) { el.textContent = 'pairing paused'; el.classList.add('full'); return; }
    if (d.free === 0) { el.innerHTML = 'all <b>' + d.max + '</b> slots full right now'; el.classList.add('full'); }
    else el.innerHTML = '<b>' + d.free + '</b> of ' + d.max + ' slots free';
    if (d.mode === 'request') {
      var steps = $('steps');
      steps.children[1].innerHTML = 'An admin reviews your request — usually within minutes. Keep this page open.';
      steps.children[2].innerHTML = 'Once approved, your 8-digit code appears right here.';
      var li = document.createElement('li');
      li.setAttribute('data-n', '4');
      li.innerHTML = '<span>On your phone: <b>WhatsApp → Linked devices → Link a device</b>, then <b>Link with phone number instead</b> and type the code.</span>';
      steps.appendChild(li);
      $('btn-start').textContent = 'Request my code';
    }
  }).catch(function () {});

  $('btn-start').addEventListener('click', startPair);
  $('phone').addEventListener('keydown', function (e) { if (e.key === 'Enter') startPair(); });
  $('btn-copy').addEventListener('click', function () {
    var code = $('code').textContent.replace(/[^0-9A-Z]/gi, '');
    if (navigator.clipboard) navigator.clipboard.writeText(code);
    this.textContent = 'Copied!';
    var b = this; setTimeout(function () { b.textContent = 'Copy code'; }, 1600);
  });
  $('btn-retry').addEventListener('click', function () {
    $('btn-retry').classList.add('hidden'); startPair();
  });

  function startPair() {
    var digits = $('phone').value.replace(/[^0-9]/g, '');
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
      deadline = 0;
      show('card-progress');
      setStep(2);
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
      setStep(2);
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
      setStep(1);
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
      setStep(2);
      spin.style.display = 'none';
      codeBox.classList.remove('hidden');
      title.textContent = 'Your pairing code';
      sub.innerHTML = 'On your phone now:<br><b>WhatsApp → Linked devices → Link a device</b><br>then <b>Link with phone number instead</b>.';
      if (data && data.code) renderCode(data.code);
      if (!deadline) { deadline = Date.now() + 3 * 60 * 1000; startCountdown(); }
    } else if (phase === 'finishing') {
      setStep(3);
      spin.style.display = 'block';
      codeBox.classList.add('hidden');
      title.textContent = 'Code accepted';
      sub.textContent = 'Finishing setup — your bot is coming online…';
    } else if (phase === 'linked') {
      clearInterval(pollTimer); clearInterval(countTimer);
      $('success-num').textContent = '+' + phone + (data && data.name ? ' — ' + data.name : '');
      show('card-success');
      confetti();
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
      var left = Math.max(0, (deadline - Date.now()) / 1000);
      var m = Math.floor(left / 60), s = Math.floor(left % 60);
      var txt = $('countdown'), fill = $('bar-fill');
      txt.textContent = 'code expires in ' + m + ':' + (s < 10 ? '0' : '') + s;
      fill.style.width = (left / 180 * 100) + '%';
      fill.classList.toggle('warn', left <= 60);
      txt.classList.toggle('warn', left <= 60);
      if (left <= 0) clearInterval(countTimer);
    }, 250);
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

export { router as pairRouter, SOCIALS };
