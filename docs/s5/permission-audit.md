# S5 — Extension permission audit (REQ-003/004/005)

| Permission | Why | Alternative rejected |
|------------|-----|----------------------|
| `storage` | Persist vault URL + session token (not PIN/DEK) | — |
| `activeTab` | Autofill / generate-fill on user gesture | Avoids broad scripting until click |
| `scripting` | Inject/message content helpers when needed | Minimal |
| `contextMenus` | “Autofill” and “Generate & fill” from right-click | UX without always-on toolbar |
| `tabs` | Read active tab URL for origin matching | Required for match-by-origin |
| `host_permissions` `http(s)://*/*` | Content script on login pages; call user vault URL | MV3 host access; user controls vault host |

## Explicitly not requested
- `cookies`, `webRequest`, `debugger`, `nativeMessaging`, `<all_urls>` chrome://
- Clipboard read

## Secrets policy
- PIN never stored
- DEK only in service worker memory while unlocked
- Session token in `chrome.storage.local` (device-bound; revoke by rotating vault sessions later)

## Review cadence
Re-audit permissions on every extension PR that touches `manifest.json`.
