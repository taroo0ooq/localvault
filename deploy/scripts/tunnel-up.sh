#!/usr/bin/env sh
# Start vault host with a tunnel profile.
# Usage: ./deploy/scripts/tunnel-up.sh cloudflare|ngrok|lan
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
cd "$ROOT"
PROFILE="${1:-cloudflare}"
COMPOSE="deploy/docker/compose.yml"

case "$PROFILE" in
  cloudflare)
    test -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" || {
      echo "Set CLOUDFLARE_TUNNEL_TOKEN" >&2
      exit 1
    }
    export VAULT_TUNNEL_MODE=1
    export VAULT_PUBLISH="${VAULT_PUBLISH:-127.0.0.1:8443}"
    docker compose -f "$COMPOSE" --profile cloudflare up -d --build
    ;;
  ngrok)
    test -n "${NGROK_AUTHTOKEN:-}" || {
      echo "Set NGROK_AUTHTOKEN" >&2
      exit 1
    }
    export VAULT_TUNNEL_MODE=1
    export VAULT_PUBLISH="${VAULT_PUBLISH:-127.0.0.1:8443}"
    docker compose -f "$COMPOSE" --profile ngrok up -d --build
    ;;
  lan)
    export VAULT_TUNNEL_MODE=0
    export VAULT_PUBLISH="${VAULT_PUBLISH:-0.0.0.0:8443}"
    docker compose -f "$COMPOSE" up -d --build
    ;;
  *)
    echo "usage: $0 cloudflare|ngrok|lan" >&2
    exit 1
    ;;
esac

echo "Stack started (profile=$PROFILE). Point clients at VAULT_PUBLIC_BASE_URL or LAN IP."
