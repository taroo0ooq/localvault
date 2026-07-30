# S4 — Public exposure threat notes (REQ-008)

## Assets
- Ciphertext vault blobs (items, wrapped DEKs)
- Session bearer tokens
- Device public keys / pairing material
- Username list (enumeration risk)

## Trust boundaries
1. **Client device** — holds PIN/recovery/DEK after unlock (trusted for owner)
2. **Tunnel edge** (Cloudflare / ngrok) — terminates TLS; may see connection metadata
3. **Docker host** — stores ciphertext only; runs vault-api + tunnel agent
4. **Internet attacker** — can reach public hostname if tunnel is up

## Threats & mitigations

| Threat | Mitigation |
|--------|------------|
| Port-forward whole LAN | Prefer `VAULT_PUBLISH=127.0.0.1:8443` + tunnel only |
| Tunnel provider MITM | TLS to edge; app still requires session + unlock; ciphertext only on wire for items |
| Token/session theft | Bearer tokens; short-ish device sessions; revoke devices (future) |
| Username enumeration | Generic `auth_failed` on login; check-username only for registration UX |
| Open vault without PIN | Tunnel access ≠ unlock; DEK never on server |
| Compromised tunnel token | Rotate token in provider dashboard; re-deploy agent |
| Accidental `0.0.0.0` publish | Documented default loopback when `VAULT_TUNNEL_MODE=1` |
| DDoS / scraping | Cloudflare Access / ngrok auth optional front door |

## Residual risk
Tunnel operators can observe that a host is online and traffic volumes. They cannot decrypt vault items without client secrets.

## Operator checklist
1. Enable Cloudflare Access (recommended) for household only
2. Never commit `CLOUDFLARE_TUNNEL_TOKEN` / `NGROK_AUTHTOKEN`
3. Use HTTPS public URL only in clients (`VAULT_PUBLIC_BASE_URL`)
4. Keep recovery passphrases offline
