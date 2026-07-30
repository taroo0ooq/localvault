# LocalVault

Local-first, multiuser password manager. Vault host on **Docker Desktop**; light clients later (web, Tauri, Flutter, browser extension).

## Status

| Stage | Name | Status |
|-------|------|--------|
| S0 | Planning | Complete (plan v1.2.0) |
| S1 | Monorepo + CI skeleton | Complete |
| S2 | Vault API + multiuser | Complete |
| S3 | Web + enrollment + import | Complete |

## Monorepo layout

```
apps/vault-api     Go API (S1: healthz only)
apps/web           Placeholder (S3)
apps/desktop       Tauri (S6)
apps/mobile        Flutter (S7)
apps/extension     MV3 (S5)
packages/crypto    Crypto (S3; S1 stub)
packages/importers CSV import (S3; S1 stub)
packages/api-client
packages/shared-types
deploy/docker      Compose + Dockerfile
tests/e2e          Playwright
docs/plan          Living plan YAMLs
```

## Quick start (S1)

```bash
# API
cd apps/vault-api && go test ./... && go run ./cmd/server

# JS packages
npm ci && npm test && npm run typecheck

# Docker
docker compose -f deploy/docker/compose.yml up --build
curl -s http://127.0.0.1:8443/healthz
```

## Governance

1. Cross-reference `docs/plan/00-master-plan.yaml` before coding.
2. No merge without SAST + secrets + DAST + Playwright (required checks).
3. Bugs → GitHub Issues → `fix/{n}-slug`.
4. Enrollment order: **username → PIN → recovery passphrase**.
5. Stage handover YAML after each stage.

## Plan

See [`docs/plan/`](docs/plan/) and handovers under [`docs/handovers/`](docs/handovers/).
