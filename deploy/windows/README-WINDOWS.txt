LocalVault Host for Windows
===========================

This ZIP is the supported Windows distribution (not a bare .exe download).

Contents
--------
  LocalVault-Host.exe          Vault API (zero-knowledge host)
  Start-LocalVault-Host.cmd    Double-click launcher (loopback)
  Start-LocalVault-Host.ps1    PowerShell launcher (+ Unblock-File)
  SHA256.txt                   Checksums
  DEFENDER-FALSE-POSITIVE.md   If Defender blocks the file

Quick start
-----------
1. Right-click the ZIP → Properties → Unblock (if shown) → OK
2. Extract the entire folder (do not run the .exe from inside the ZIP)
3. Double-click Start-LocalVault-Host.cmd
   OR in PowerShell:  powershell -ExecutionPolicy Bypass -File .\Start-LocalVault-Host.ps1
4. Open the LocalVault web client / extension and connect to:
      http://127.0.0.1:8443

Default bind is 127.0.0.1 (this PC only). For LAN access:
  set VAULT_LISTEN=0.0.0.0:8443
  Start-LocalVault-Host.cmd

Verify integrity
----------------
  certutil -hashfile LocalVault-Host.exe SHA256
  Compare to SHA256.txt

Code signing
------------
Official builds may be unsigned open-source binaries. Windows SmartScreen and
Defender sometimes flag new unsigned network services. See
DEFENDER-FALSE-POSITIVE.md. We do not ship malware — source is public on GitHub.

Source: https://github.com/taroo0ooq/localvault
Release: https://github.com/taroo0ooq/localvault/releases
