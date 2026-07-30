# vault-api (S1 scaffold)

Minimal Go HTTP service for LocalVault.

- `GET /healthz` — liveness
- `GET /v1/server-info` — non-secret metadata

**S2** will add multiuser register/login, device pairing, encrypted item CRUD.

```bash
go test ./...
go run ./cmd/server
```
