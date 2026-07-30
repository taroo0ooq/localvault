# S7 — Mobile OS autofill (REQ-007)

## Android
1. Install APK / run `flutter run`
2. Settings → System → Languages & input → Autofill service → **LocalVault**
3. Unlock LocalVault with biometrics/PIN
4. Open any app login form → LocalVault datasets appear

`LocalVaultAutofillService` serves datasets only while vault is marked unlocked.

## iOS
1. Attach Credential Provider target (see `ios/CredentialProvider/README.md`)
2. Settings → Passwords → Password Options → enable **LocalVault**
3. Unlock app → fill from QuickType bar / passwords UI

## Security
- PIN/biometrics required before secrets leave the app process into OS autofill APIs
- Lock clears in-memory DEK and Android password hints
- Server still stores ciphertext only
