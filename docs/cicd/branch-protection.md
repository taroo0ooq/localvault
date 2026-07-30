# Branch protection policy (REQ-012)

## `main` / `develop` required status checks

| Check | Workflow |
|-------|----------|
| `ci` | lint / unit / build |
| `sast-codeql` | CodeQL |
| `sast-semgrep` | Semgrep |
| `secrets-gitleaks` | Gitleaks |
| `dependency-scan` | govulncheck / npm audit |
| `dast-zap` | ZAP baseline |
| `dast-zap-full` | ZAP full (HIGH/CRITICAL) |
| `e2e-playwright` | Playwright |
| `desktop-ci` | Tauri/frontend + core-rs |
| `mobile-ci` | Flutter analyze + test |

## Rules

- No direct commits to `main`
- No force-push to `main`
- PR required; squash merge preferred
- Admin bypass only for emergency hotfix with post-hoc issue

## Apply (GitHub Pro / org)

```bash
gh api -X PUT repos/{owner}/{repo}/branches/main/protection \
  --input docs/cicd/branch-protection-payload.json
```

See also issue templates under `.github/ISSUE_TEMPLATE/`.
