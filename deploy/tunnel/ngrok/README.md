# ngrok (alternate) — REQ-008

Use when Cloudflare is unavailable. Same zero-knowledge model applies.

```bash
export NGROK_AUTHTOKEN="..."
export VAULT_TUNNEL_MODE=1
export VAULT_PUBLISH=127.0.0.1:8443
docker compose -f deploy/docker/compose.yml --profile ngrok up -d --build
# Copy public HTTPS URL from ngrok dashboard/logs into LocalVault Connect field
```

Do not expose the Docker host port publicly when ngrok is the edge.
