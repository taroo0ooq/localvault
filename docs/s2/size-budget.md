# S2 size budget notes

| Component | Target | Notes |
|-----------|--------|--------|
| vault-api binary (static) | ≤ 25 MB | Distroless + pure Go sqlite |
| Docker image | ≤ 40 MB compressed | measure after `docker build` |
| RAM idle | ≤ 64 MB | SQLite single writer |

Measure locally:

```bash
cd apps/vault-api && CGO_ENABLED=0 go build -o /tmp/vault-api ./cmd/server
ls -lh /tmp/vault-api
docker build -f deploy/docker/Dockerfile.vault-api -t localvault-api:s2 .
docker images localvault-api:s2
```
