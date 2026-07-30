# vault-api (S2 — multiuser)

Zero-knowledge vault host API. Server stores **ciphertext only**.

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/healthz` | no | Liveness |
| GET | `/v1/server-info` | no | Features |
| GET | `/v1/users/check?username=` | no | Availability |
| POST | `/v1/users/register` | no | Create user + device + vault_meta + session |
| POST | `/v1/auth/challenge` | no | Device login challenge |
| POST | `/v1/auth/session` | no | Exchange ed25519 signature for session |
| GET/POST | `/v1/devices` | yes | List / pair devices |
| GET/PUT | `/v1/vault/meta` | yes | Per-user wrapped DEKs + kdf_params |
| CRUD | `/v1/items` | yes | Ciphertext items (user-scoped) |

## Register contract (client does crypto in S3)

Enrollment order on client: **username → PIN → recovery** then POST register with:

- `wrapped_dek_pin`, `wrapped_dek_recovery`, `kdf_params_json` (opaque to server)
- `device_public_key` (ed25519 base64)

## Run

```bash
export VAULT_DB=./vault.db VAULT_LISTEN=127.0.0.1:8443
go run ./cmd/server
```
