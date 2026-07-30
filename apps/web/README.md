# LocalVault Web (S3)

Enrollment: **username → PIN → recovery passphrase** → register on S2 API.

```bash
# Terminal 1: vault API
cd apps/vault-api && VAULT_DB=/tmp/v.db VAULT_LISTEN=127.0.0.1:8443 go run ./cmd/server

# Terminal 2: web
cd apps/web && npm run dev
```
