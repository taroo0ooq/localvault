# Branch protection (LocalVault)

## Policy (from docs/plan/03-cicd-gates.yaml)

### `main` and `develop`
- Require pull request before merge
- Require approvals: **1** (CODEOWNERS for owned paths)
- Require status checks to pass:
  - `lint`
  - `typecheck`
  - `unit-tests`
  - `build` (from ci.yml)
  - `sast-codeql`
  - `sast-semgrep`
  - `secrets-gitleaks`
  - `dependency-scan`
  - `dast-zap`
  - `e2e-playwright`
- Require branches to be up to date before merge
- Do **not** allow force push
- Do **not** allow deletions
- Do **not** allow `[skip ci]` bypass for required checks

## Apply with GitHub UI or CLI

```bash
# Example (admin): enable protection on main
gh api -X PUT repos/taroo0ooq/localvault/branches/main/protection \
  -f required_status_checks='{"strict":true,"contexts":["lint","typecheck","unit-tests","build","sast-codeql","sast-semgrep","secrets-gitleaks","dependency-scan","dast-zap","e2e-playwright"]}' \
  -F enforce_admins=true \
  -f required_pull_request_reviews='{"required_approving_review_count":1}' \
  -F allow_force_pushes=false \
  -F allow_deletions=false
```

Note: Status check names must match job `name:` fields after first successful workflow run on the branch.

## S1 status
- Workflows are present and required for PR merge process.
- Protection should be applied after the first green run on this PR so check names exist.
