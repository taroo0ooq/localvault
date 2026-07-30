# LocalVault

Local-first, **multiuser**, zero-knowledge password manager.

- **Vault host:** Docker Desktop (`apps/vault-api`)
- **Clients:** Web · Browser extension (MV3) · Tauri desktop · Flutter mobile
- **Access:** LAN or Cloudflare / ngrok tunnel
- **Crypto:** Argon2id (device profiles) + AES-256-GCM · recovery passphrase at enroll

## Stage status (v1 complete)

| Stage | Name | Status |
|-------|------|--------|
| S0 | Planning + roadmap | Complete |
| S1 | Monorepo + CI skeleton | Complete |
| S2 | Vault API + multiuser | Complete |
| S3 | Web + enrollment + import | Complete |
| S4 | Tunnel connectivity | Complete |
| S5 | Browser extension (MV3) | Complete |
| S6 | Desktop (Tauri) | Complete |
| S7 | Mobile + OS autofill | Complete |
| **S8** | **Hardening + full DAST + release** | **Complete** |

## Monorepo

```
apps/vault-api     Go API (hardened S8)
apps/web           Web client + import + generator
apps/desktop       Tauri 2 (macOS / Windows)
apps/mobile        Flutter + Android Autofill + iOS CP
apps/extension     MV3 autofill / autosave / generate-fill
apps/tunnel-edge   Tunnel compose helpers
packages/*         crypto, importers, api-client, shared-types
deploy/docker      Compose + Dockerfile
tests/e2e          Playwright
tests/dast         ZAP rules
docs/plan          Living plan YAMLs
docs/handovers     Stage handovers (S0–S8)
docs/s8            Release runbook + residual risks
```

## Quick start

```bash
# API
cd apps/vault-api && go test ./... && go run ./cmd/server

# JS packages + web
npm ci && npm test && npm run typecheck

# Docker
docker compose -f deploy/docker/compose.yml up --build
curl -s http://127.0.0.1:8443/healthz
```

## Release

See **[docs/s8/release-runbook.md](docs/s8/release-runbook.md)**.  
Tag `v*` → multi-arch binaries, SBOM, checksums, optional cosign, GitHub Release.

## Governance

1. Cross-reference `docs/plan/00-master-plan.yaml` before coding.
2. No merge without SAST + secrets + DAST (baseline + full) + Playwright (+ desktop/mobile CI).
3. Bugs → GitHub Issues → `fix/{n}-slug` (REQ-013).
4. Enrollment order: **username → PIN → recovery passphrase**.
5. Stage handover YAML after each stage (REQ-014).

## Security residual risks

[`docs/s8/residual-risk-register.yaml`](docs/s8/residual-risk-register.yaml)
