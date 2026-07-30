#!/usr/bin/env sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
cd "$ROOT"
# Structural validation without requiring docker daemon compose plugin secrets
python3 - <<'PY'
import sys, re
from pathlib import Path

compose = Path("deploy/docker/compose.yml").read_text()
assert "profiles: [\"cloudflare\"]" in compose or "profiles: ['cloudflare']" in compose or "cloudflare" in compose
assert "cloudflared" in compose
assert "ngrok" in compose
assert "profiles:" in compose
assert "vault-api" in compose
assert "127.0.0.1:8443" in compose or "VAULT_PUBLISH" in compose
print("compose.yml structure OK (cloudflare + ngrok profiles present)")

for p in [
    "deploy/tunnel/cloudflared/config.example.yml",
    "deploy/tunnel/ngrok/ngrok.example.yml",
    "docs/s4/threat-model-public-exposure.md",
    "docs/s4/remote-pairing.md",
]:
    assert Path(p).exists(), p
print("tunnel docs present")
PY
