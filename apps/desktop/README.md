# LocalVault Desktop (S6 — Tauri 2)

Cross-platform desktop shell for macOS and Windows (Linux dev supported).

```bash
# Frontend only
npm run build --workspace=@localvault/desktop

# Full native (requires OS toolchain + webview)
npm run tauri:dev --workspace=@localvault/desktop
npm run tauri:build --workspace=@localvault/desktop

# Rust unit tests
cd apps/desktop/src-tauri && cargo test
```

See `docs/s6/desktop-build.md`.
