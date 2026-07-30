# LocalVault Mobile (S7)

Flutter client with **Android Autofill Service** and **iOS Credential Provider** scaffold.

```bash
cd apps/mobile
flutter pub get
flutter test
flutter run
```

Enrollment: **username → PIN → recovery** (mobile Argon2id 64MiB/t3/p1).  
Biometrics gate unlock when the device supports it.
