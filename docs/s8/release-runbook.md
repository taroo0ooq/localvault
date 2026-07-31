# LocalVault release runbook (S8)

## Preconditions

1. `main` is green on **all** required checks:
   - `ci` · `sast-codeql` · `sast-semgrep` · `secrets-gitleaks`
   - `dependency-scan` · `dast-zap` · `dast-zap-full`
   - `e2e-playwright` · `desktop-ci` · `mobile-ci`
2. Stage handovers S0–S7 exist under `docs/handovers/`
3. Residual risks reviewed: `docs/s8/residual-risk-register.yaml`
4. No open **critical** GitHub issues without mitigation plan

## Versioning

- SemVer tags: `vMAJOR.MINOR.PATCH` (e.g. `v0.8.0`)
- Conventional commits on `main`
- Release branches optional: `release/vX.Y.Z` for freeze windows

## Cut a release

```bash
# 1. Ensure clean main
git checkout main && git pull

# 2. Tag (annotated)
git tag -a v0.8.0 -m "LocalVault v0.8.0 — S8 release readiness"
git push origin v0.8.0

# 3. GitHub Actions `release` workflow builds:
#    - multi-arch vault-api binaries
#    - SHA256SUMS
#    - SBOM (SPDX)
#    - Docker image tarball
#    - optional cosign bundles (keyless OIDC)
#    - GitHub Release assets
```

## Operator deploy (Docker Desktop)

```bash
# From release notes — verify checksums
sha256sum -c SHA256SUMS

docker load < localvault-api-image-v0.8.0.tar.gz
# or rebuild from tag:
docker compose -f deploy/docker/compose.yml up -d --build

# Tunnel (optional remote access)
# Follow docs/s4/* for Cloudflare or ngrok agent
```

## Recovery passphrase UX verification checklist

- [ ] First registration shows recovery **after** username + PIN only
- [ ] Passphrase is CSPRNG / diceware-style, shown once
- [ ] User must acknowledge before continuing (web/desktop/mobile)
- [ ] Unlock with recovery still derives DEK client-side
- [ ] Recovery never logged or sent to vault-api

## Import verification (REQ-018 / REQ-019)

- [ ] Google Password Manager CSV import path works client-side
- [ ] Apple Passwords CSV import path works client-side
- [ ] Imported items encrypted with DEK before `POST /v1/items`
- [ ] In-app export guides visible

## Security regression

```bash
# Local full ZAP (optional)
docker compose -f deploy/docker/compose.ci.yml up -d --build
# CI runs dast-zap-full on tag
```

## Rollback

1. Redeploy previous image tag
2. Database is additive ciphertext — prefer restore of `/data/vault.db` snapshot taken pre-upgrade
3. Clients remain compatible if API version minor-compatible

## Bug process (REQ-013)

1. File GitHub Issue with severity, repro, stage, REQ id  
2. Branch `fix/<issue-number>-slug`  
3. Same CI gates as feature PRs  
4. Link issue in PR; squash merge only when green  


## Windows host distribution (Defender)

Do **not** publish a bare `*.exe` as the primary Windows download. Ship:

`LocalVault-Host-windows-amd64-vX.Y.Z.zip`

containing PE-metadata binary + launcher + `DEFENDER-FALSE-POSITIVE.md`.

Users should Unblock the ZIP, extract, run `Start-LocalVault-Host.cmd`.
Long-term: Authenticode signing (Azure Trusted Signing / EV cert).
