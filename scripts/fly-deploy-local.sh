#!/usr/bin/env bash
# NEXORA-TELEGRAM → Fly.io, local one-shot deploy.
# Run on YOUR machine (flyctl installed + `fly auth login` done), from repo root:
#   bash scripts/fly-deploy-local.sh
#
# Note: my sandbox cannot reach Fly's depot builder (TLS handshake reset by
# egress proxy), so remote builds must run from GitHub Actions or locally.
set -euo pipefail
APP="${FLY_APP:-nexora-telegram}"

command -v fly >/dev/null || { echo "✗ flyctl not found — install: curl -L https://fly.io/install.sh | sh"; exit 1; }
fly auth whoami >/dev/null 2>&1 || { echo "✗ not logged in — run: fly auth login"; exit 1; }

echo "── ensuring app '$APP'…"
fly status -a "$APP" >/dev/null 2>&1 || fly launch --no-deploy --copy-config --name "$APP"

echo "── ensuring volumes…"
fly volumes list -a "$APP" -j | grep -q '"name":"nexora_session"'  \
  || fly volumes create nexora_session --size 1 -a "$APP"
fly volumes list -a "$APP" -j | grep -q '"name":"nexora_database"' \
  || fly volumes create nexora_database --size 1 -a "$APP"

echo "── deploying…"
fly deploy -a "$APP"

cat <<'EOF'

✓ Deployed. Required secret before the Telegram side connects:
   fly secrets set -a nexora-telegram TELEGRAM_BOT_TOKEN=<fresh token from @BotFather /revoke>
  (rotate it — the old one sat in Railway env vars during the incident)
  WhatsApp side: bash scripts/fly-deploy-local.sh in NEXORA-MD, then use its /pair page.
EOF
