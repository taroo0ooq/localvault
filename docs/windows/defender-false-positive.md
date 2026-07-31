# Windows Defender / SmartScreen false positives

## Why this happens

`LocalVault-Host.exe` is a **legitimate open-source** Go network service (local
password-vault API). Windows Defender and SmartScreen often block:

- Brand-new binaries with **no download reputation**
- **Unsigned** executables (no Authenticode certificate)
- Programs that **listen on a TCP port** (heuristic: “backdoor / hacktool”)

This is a **false positive**. The same source builds Linux/macOS binaries used in CI.

LocalVault never ships a packed/UPX binary, never injects into other processes,
and defaults to **loopback-only** listen (`127.0.0.1:8443`) via the launcher.

## Safe install steps (recommended)

1. Download **`LocalVault-Host-windows-amd64-v*.zip`** (not a bare `.exe` link).
2. Right-click ZIP → **Properties** → check **Unblock** → Apply.
3. Extract to e.g. `%LOCALAPPDATA%\LocalVault\`.
4. Run **`Start-LocalVault-Host.cmd`** (or the `.ps1` launcher).
5. Verify hash:
   ```powershell
   Get-FileHash .\LocalVault-Host.exe -Algorithm SHA256
   # compare with SHA256.txt in the zip / release SHA256SUMS
   ```

## If Defender quarantined the file

1. Open **Windows Security** → **Virus & threat protection**.
2. **Protection history** → find LocalVault → **Actions** → **Allow** / **Restore**.
3. Optional exclusion (only if you trust the hash):
   - **Manage settings** → **Exclusions** → add the extract folder.

PowerShell unblock after restore:

```powershell
Unblock-File -Path .\LocalVault-Host.exe
Unblock-File -Path .\Start-LocalVault-Host.ps1
```

## SmartScreen “Windows protected your PC”

1. Click **More info**
2. Click **Run anyway**
3. Prefer building from source if your org blocks all unsigned tools:

```powershell
git clone https://github.com/taroo0ooq/localvault.git
cd localvault\apps\vault-api
go build -o LocalVault-Host.exe .\cmd\server
```

## Report false positive to Microsoft

Help all users: submit the file to Microsoft:

- https://www.microsoft.com/en-us/wdsi/filesubmission  
  Choose “Software developer” / false positive, include the GitHub release URL
  and SHA-256 from `SHA256SUMS`.

## Long-term fix (maintainers)

Authenticode **code signing** (EV or Azure Trusted Signing) removes SmartScreen
warnings after reputation builds. Tracked as operational follow-up; open-source
CI cannot sign without a purchased/organizational certificate.
