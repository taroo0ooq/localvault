# Cloudflare Tunnel (primary) — REQ-008 / ADR-004

## Why Cloudflare first
- Stable always-on tunnels without inbound port forwards
- Optional **Cloudflare Access** gate in front of the vault hostname
- Provider sees TLS traffic only; vault contents remain client-side ciphertext

## Quick start (token mode — recommended)

1. Zero Trust → Networks → Tunnels → Create → Docker
2. Copy the tunnel token
3. From repo root:

```bash
export CLOUDFLARE_TUNNEL_TOKEN="eyJ..."
export VAULT_TUNNEL_MODE=1
export VAULT_PUBLIC_BASE_URL="https://vault.example.com"
export VAULT_PUBLISH=127.0.0.1:8443
docker compose -f deploy/docker/compose.yml --profile cloudflare up -d --build
```

4. In LocalVault web: Connect → paste `https://vault.example.com`

## Security checklist
- [ ] Origin not published on `0.0.0.0` when tunnel is active
- [ ] Cloudflare Access enabled for the hostname (optional but recommended)
- [ ] No tokens in git
- [ ] Clients still use PIN / recovery / device session (tunnel ≠ vault unlock)
