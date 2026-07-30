# S6 — Desktop build matrix (REQ-002, REQ-009)

| Target | Command | Artifact |
|--------|---------|----------|
| macOS (arm64/x64) | `npm run tauri build --workspace=@localvault/desktop` on macOS runner | `.dmg` / `.app` |
| Windows | same on windows-latest | `.msi` / NSIS `.exe` |
| Linux (dev/CI check) | `cargo check` + frontend `vite build` | no required ship target for v1 |

## Size budget
- Installer target: **≤ 15 MB** compressed (plan `desktop_installer_mb_target`)
- Measure: `docs/s6/size-budget.sh` after `tauri build`

## Biometrics
| OS | Method | DEK derivation |
|----|--------|----------------|
| macOS | Touch ID / Face ID gate | Still PIN → Argon2id (desktop profile) |
| Windows | Windows Hello gate | Same |
| Linux | Not available (PIN only) | Same |

Biometrics **never replace** the KDF; they gate access to the unlock UX (zero-knowledge preserved).
