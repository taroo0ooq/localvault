# LocalVault Vault Host launcher (PowerShell)
# Default: loopback only (127.0.0.1:8443)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# Unblock files after download from the internet (Zone.Identifier)
Get-ChildItem -Path $PSScriptRoot -File | ForEach-Object {
  try { Unblock-File -Path $_.FullName -ErrorAction SilentlyContinue } catch {}
}

if (-not (Test-Path ".\data")) { New-Item -ItemType Directory -Path ".\data" | Out-Null }

if (-not $env:VAULT_LISTEN) { $env:VAULT_LISTEN = "127.0.0.1:8443" }
if (-not $env:VAULT_DB) { $env:VAULT_DB = (Join-Path $PSScriptRoot "data\vault.db") }

Write-Host ""
Write-Host " LocalVault Host" -ForegroundColor Cyan
Write-Host " ---------------"
Write-Host " Listen:   $($env:VAULT_LISTEN)"
Write-Host " Database: $($env:VAULT_DB)"
Write-Host " Connect web/extension to http://127.0.0.1:8443"
Write-Host " Press Ctrl+C to stop."
Write-Host ""

& (Join-Path $PSScriptRoot "LocalVault-Host.exe")
