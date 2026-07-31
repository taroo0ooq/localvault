#!/usr/bin/env bash
# Build LocalVault Windows host with PE version resources + zip package.
# Bare unsigned .exe downloads often trip Defender heuristics; we ship a ZIP
# with product metadata, loopback default launcher, and checksums instead.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
API="$ROOT/apps/vault-api"
OUT="${1:-$ROOT/dist/windows-host}"
VERSION="${VERSION:-0.8.1}"
mkdir -p "$OUT" "$API/cmd/server"

echo "==> installing goversioninfo"
GOBIN="${GOBIN:-$(go env GOPATH)/bin}"
export PATH="$GOBIN:$PATH"
go install github.com/josephspurrier/goversioninfo/cmd/goversioninfo@v1.4.1

echo "==> generating PE resources (amd64)"
cd "$API"
# goversioninfo writes resource.syso into CWD by default when -o given
rm -f cmd/server/resource.syso resource.syso
(
  cd winres
  goversioninfo -64 \
    -o ../cmd/server/resource.syso \
    -manifest app.manifest \
    versioninfo.json
)

echo "==> building LocalVault-Host.exe"
cd "$API"
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 \
  go build -trimpath \
    -ldflags="-s -w -X main.buildVersion=${VERSION} -X main.buildProduct=LocalVault-Host" \
    -o "$OUT/LocalVault-Host.exe" \
    ./cmd/server

# clean syso so non-windows builds are unaffected
rm -f cmd/server/resource.syso

echo "==> packaging zip (preferred distribution — not bare .exe)"
cp "$ROOT/deploy/windows/Start-LocalVault-Host.cmd" "$OUT/"
cp "$ROOT/deploy/windows/Start-LocalVault-Host.ps1" "$OUT/"
cp "$ROOT/deploy/windows/README-WINDOWS.txt" "$OUT/"
cp "$ROOT/docs/windows/defender-false-positive.md" "$OUT/DEFENDER-FALSE-POSITIVE.md" 2>/dev/null || true

# checksum inside package
(
  cd "$OUT"
  sha256sum LocalVault-Host.exe Start-LocalVault-Host.cmd Start-LocalVault-Host.ps1 README-WINDOWS.txt > SHA256.txt 2>/dev/null \
    || shasum -a 256 LocalVault-Host.exe Start-LocalVault-Host.cmd Start-LocalVault-Host.ps1 README-WINDOWS.txt > SHA256.txt
)

python3 - << PY
import zipfile
from pathlib import Path
out_dir = Path("$OUT")
zip_path = out_dir / f"LocalVault-Host-windows-amd64-v${VERSION}.zip"
files = [
    "LocalVault-Host.exe",
    "Start-LocalVault-Host.cmd",
    "Start-LocalVault-Host.ps1",
    "README-WINDOWS.txt",
    "SHA256.txt",
    "DEFENDER-FALSE-POSITIVE.md",
]
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
    for name in files:
        p = out_dir / name
        if p.exists():
            z.write(p, name)
print("wrote", zip_path, zip_path.stat().st_size)
PY

echo "==> done: $OUT"
ls -lh "$OUT"
