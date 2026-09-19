# Deploying NEXORA-MD (Railway / Fly.io)

Both platforms build the Dockerfile as-is. `npm ci` resolves `baileys`
deterministically to `v0.3.18-r4` commit `7952bd8` over https (lockfile
fixed in `8a23938`) — no SSH keys needed in CI.

## Environment variables (required)

| Variable | Value |
|---|---|
| `OWNER_NUMBERS` | Your number(s), comma-separated, no `+` — e.g. `2335xxxxxxx`. Gates owner-only commands like `.testrich` |
| `OWNER_NAME` | Display name, e.g. `Aizen` |
| `PAIRING_ENABLED` | `true` recommended for cloud deploys (pairing code) — see below |
| `PAIRING_PHONE` | Your number incl. country code, no `+` — must be in `OWNER_NUMBERS` |
| `NEXORA_RICH_RESPONSE` | `1` — enables the rich response card paths (the whole point of this deploy; default stays off until device tests pass) |

Optional: `GEMINI_API_KEY` (AI features), `PUBLIC_MODE` (default `false`),
`AUTO_READ` (default `true`), `DB_PATH=./src/database/db.json`.

**Pairing — QR vs code:** with `PAIRING_ENABLED=false` the QR prints to the
logs; scanning an ASCII QR from a log stream is painful. With
`PAIRING_ENABLED=true` the bot prints an 8-digit pairing code to the logs —
enter it in WhatsApp → *Linked devices* → *Link with phone number*.

## Persistent volumes (critical)

The auth session and database MUST live on a volume, or every
redeploy/restart forces a re-pairing and you lose the db:

| Container path | Why |
|---|---|
| `/app/session` | baileys auth creds — lost = re-pair |
| `/app/src/database` | `db.json` (bot stats/state) |

- **Fly:** create both volumes before first deploy:
  `fly volumes create nexora_session --size 1` and
  `fly volumes create nexora_database --size 1` (see `fly.toml`).
- **Railway:** attach two volumes in the service settings with the mount
  paths above.

The web port is `3000` (`PORT` env is respected); health endpoint is
`/api/health`.

## After deploy — the device test

1. Check the deploy logs for the pairing code / QR, link your WhatsApp.
2. From your linked number, run `.testrich` — walks all 44 rich builders.
3. With `NEXORA_RICH_RESPONSE=1`, the normal user-facing cards
   (`.wiki`-style tables, carousels, articles) also take the rich path —
   A/B them on the same device.
4. Record rendering results against the fork's `TESTING.md` checklist.
5. When everything renders: flip the `hasRichResp` default to `true` in
   `src/core/capabilities.js` and you can drop the env var.

## Docker / bare metal

`docker compose up -d --build` with a filled-in `.env` works out of the box
(`docker-compose.yml` already mounts both paths).
