# LocalVault

Local-first password manager: vault host on **Docker Desktop**, light clients (web, Tauri desktop, Flutter mobile, browser extensions), OS-level autofill, and strict CI/CD (SAST + DAST + Playwright).

## Status

**Stage 0 (Planning & Architecture) — COMPLETE**

Do **not** implement feature code until the current stage exit criteria are met and the stage handover YAML is written.

## Plan documents

| Document | Path |
|----------|------|
| Master plan | [`docs/plan/00-master-plan.yaml`](docs/plan/00-master-plan.yaml) |
| Roadmap / gates | [`docs/plan/01-roadmap.yaml`](docs/plan/01-roadmap.yaml) |
| Architecture | [`docs/plan/02-architecture.yaml`](docs/plan/02-architecture.yaml) |
| CI/CD gates | [`docs/plan/03-cicd-gates.yaml`](docs/plan/03-cicd-gates.yaml) |
| Security model | [`docs/plan/04-security-model.yaml`](docs/plan/04-security-model.yaml) |
| Requirements matrix | [`docs/plan/05-requirements-matrix.yaml`](docs/plan/05-requirements-matrix.yaml) |
| Stage 0 handover | [`docs/handovers/stage-00-handover.yaml`](docs/handovers/stage-00-handover.yaml) |

## Governance (non-negotiable)

1. Cross-reference every change against `docs/plan/00-master-plan.yaml`.
2. Do not skip stages or CI/CD gates.
3. No merge without SAST (CodeQL + Semgrep), secrets scan (Gitleaks), DAST (OWASP ZAP), and Playwright where applicable.
4. Bugs discovered in testing → GitHub Issues → `fix/{issue}-slug` → same CI gates.
5. After each stage → `docs/handovers/stage-NN-handover.yaml`.

## Next stage

**S1 — Monorepo Bootstrap & CI Skeleton**

See master plan section `next_after_s0` and S1 exit criteria.

## Product snapshot

- Docker Desktop vault API (Go, zero-knowledge ciphertext)
- Clients: macOS / Windows (Tauri), Android / iOS (Flutter), ChromeOS (PWA + extension + ARC), Web PWA
- Browser extension: autofill, autosave, password generate-and-fill
- Mobile: Android Autofill Service + iOS Credential Provider
- Remote access: Cloudflare Tunnel (primary) or ngrok agent
- Unlock: biometrics if available, else PIN ≥ 6 digits; first-run enrollment
