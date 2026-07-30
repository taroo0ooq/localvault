# Load LocalVault extension (Chrome / Edge / Chromium)

```bash
npm run build --workspace=@localvault/extension
```

1. Open `chrome://extensions`
2. Enable Developer mode
3. Load unpacked → select `apps/extension/dist`
4. Connect popup to vault URL (LAN or tunnel)
5. Paste session token from web register/login, unlock with PIN
6. Visit a login page → autofill chip / context menu / popup buttons
