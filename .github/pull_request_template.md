## Summary
<!-- What and why -->

## Plan cross-reference
- **Stage:** S?
- **Requirement IDs:** REQ-?
- **Plan sections:** docs/plan/...

## Test plan
- [ ] Unit tests
- [ ] SAST (CodeQL + Semgrep) green
- [ ] Secrets (Gitleaks) green
- [ ] Dependency scan
- [ ] DAST (ZAP) green (if API/deploy touched)
- [ ] Playwright green (if user-facing)

## Risk
<!-- Security / multiuser isolation / crypto notes -->

## Checklist
- [ ] No secrets committed
- [ ] No `[skip ci]` on protected branches
- [ ] Bug fixes reference `Fixes #n`
