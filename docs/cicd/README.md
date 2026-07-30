# CI/CD

Strict gates — see `docs/plan/03-cicd-gates.yaml`.

| Workflow | Job names | Purpose |
|----------|-----------|---------|
| `ci.yml` | lint, typecheck, unit-tests, build | Build quality |
| `sast-codeql.yml` | sast-codeql | SAST |
| `sast-semgrep.yml` | sast-semgrep | SAST |
| `secrets-gitleaks.yml` | secrets-gitleaks | Secrets |
| `deps.yml` | dependency-scan | Dependencies |
| `dast-zap.yml` | dast-zap | DAST baseline |
| `e2e-playwright.yml` | e2e-playwright | E2E smoke |
| `release.yml` | release-gate | Tag releases |

Bugs: use issue template → `fix/{issue}-{slug}` → same gates.

## S1 verification
Post-merge CI verification PR after first workflow registration.
