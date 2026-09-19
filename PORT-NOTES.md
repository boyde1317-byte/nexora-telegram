# NEXORA Telegram Port — Architecture Notes

NEXORA-MD with a **Telegram control panel** and a **50-session fleet cap**.
Every WhatsApp-side NEXORA feature is untouched — 214 plugins, rich-message
engine, economy, greetings, everything. The Telegram layer is purely
additive and goes inert when `TELEGRAM_BOT_TOKEN` is unset.

## What changed (complete list)

| File | Change |
|---|---|
| `src/core/sessionManager.js` | `MAX_EXTRA_SESSIONS` 5 → 50 (env-tunable, hard max 50); `tg:` notify routing; Telegram mirror of lifecycle alerts; resume stagger (1.5s/socket); `activeSessionSockets()` export |
| `src/telegram/bridge.js` | NEW — dependency-free seam between core and Telegram (`tg:<chat_id>` pseudo-JID scheme) |
| `src/telegram/index.js` | NEW — the Telegram bot: pairing, approvals, fleet commands |
| `server.js` | Boots the Telegram panel after extra-session resume |
| `package.json` | `node-telegram-bot-api` dep; name `nexora-md-telegram` |
| `.env.example` | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OWNER_ID`, `TELEGRAM_ADMIN_IDS`, `MAX_EXTRA_SESSIONS` |

## The `tg:` pseudo-JID (the whole integration in one idea)

The core addresses notification targets as JIDs. A Telegram chat is just
`tg:<chat_id>` — `notifyMain`/`notifyStatus` detect the prefix and route
through the bridge instead of the WhatsApp socket. That is the entire core
diff: pairing codes, failure notices, and lifecycle alerts all flow through
the existing notify seams, so both surfaces interoperate — a request filed
from WhatsApp can be approved from Telegram (code lands in the requester's
WA DM) and vice versa.

## Telegram commands

| Command | Access | Does |
|---|---|---|
| `/pair <number>` | admin: direct / user: request | Admin: code lands in that chat. User: request → inline Approve/Deny keyboard to all admins |
| `/pairapprove [num]` · `/pairdeny [num]` | admin | Act on the shared request queue |
| `/pairrequests` | admin | Queue listing |
| `/sessions` | all | Fleet status with per-session icons and errors |
| `/unpair <number>` | admin | Logout + delete a session |
| `/logoutall` | owner | Wipe the whole fleet |
| `/reload` | admin | Reconnect all saved sessions |
| `/broadcast <text>` | owner | All groups of all online sessions, with failure report |
| `/addadmin <id>` | owner | Grant admin (persisted in `database/telegram_admins.json`) |
| `/start` · `/help` · `/ping` | all | Guide + latency |

## Yuzuki failures deliberately NOT ported

1. **Flat 3s infinite retry** → NEXORA's exponential backoff (5s→60s, 10 attempts) kept
2. **Folder-scan as session DB** → live registry with statuses is the source of truth
3. **Anyone can pair** → requests queue behind admin approval (inline keyboards)
4. **Simultaneous boot herd** → 1.5s staggered resume (a 50-session boot takes ~75s, stable)
5. **Silent broadcast failures** → per-group error capture, reported back
6. **No flood guard** → 6 pair attempts/min/user on the Telegram side

## Setup

```bash
cp .env.example .env
# Fill OWNER_NUMBERS / SUPER_OWNER_NUMBERS / PAIRING_PHONE as usual, plus:
#   TELEGRAM_BOT_TOKEN  — from @BotFather
#   TELEGRAM_OWNER_ID   — your id from @userinfobot
npm install
npm start
```

## Fleet sizing (50 sessions)

Each live session is a full Baileys socket: ~40-70MB RAM typical. Budget
**2-4 GB RAM** for a full 50-session fleet, and use a persistent volume so
`session/extras/` survives restarts. Lower `MAX_EXTRA_SESSIONS` in env on
small hosts — the cap is a memory decision, nothing else.
