# Remote pairing over tunnel

1. Host starts vault-api + tunnel (`./deploy/scripts/tunnel-up.sh cloudflare`)
2. Operator copies public HTTPS URL into mobile/web **Connect** field
3. New user: Register (username → PIN → recovery) — device ed25519 key stored
4. Existing user on new device: pair device with authenticated session (LAN first) or challenge/session with existing device key
5. Playwright `remote-pair` e2e simulates the edge with a reverse proxy (no real Cloudflare token in CI)

Session tokens remain bound to `user_id` + `device_id` (S2). Isolation is unchanged over the tunnel path.
