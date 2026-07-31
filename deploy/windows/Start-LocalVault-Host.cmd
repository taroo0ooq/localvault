@echo off
REM LocalVault Vault Host launcher (Windows)
REM Defaults to loopback only. Override with set VAULT_LISTEN=0.0.0.0:8443 for LAN.
setlocal
cd /d "%~dp0"
if not exist "data" mkdir data
if "%VAULT_LISTEN%"=="" set VAULT_LISTEN=127.0.0.1:8443
if "%VAULT_DB%"=="" set VAULT_DB=%~dp0data\vault.db
echo.
echo  LocalVault Host
echo  ---------------
echo  Listen: %VAULT_LISTEN%
echo  Database: %VAULT_DB%
echo  Open web client and connect to http://127.0.0.1:8443
echo  Press Ctrl+C to stop.
echo.
"%~dp0LocalVault-Host.exe"
endlocal
