# iOS Credential Provider (S7)

1. Open `ios/Runner.xcworkspace` in Xcode
2. File → New → Target → Credential Provider Extension (or attach this folder)
3. Enable App Groups: `group.com.localvault.mobile` on Runner + extension
4. Enable AutoFill Credential Provider capability on Runner
5. Users enable: Settings → Passwords → Password Options → LocalVault

The extension reads unlock state from the App Group; Flutter writes index after PIN/biometric unlock.
