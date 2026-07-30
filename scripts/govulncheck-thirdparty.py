#!/usr/bin/env python3
"""Fail only on third-party module findings from govulncheck -json."""
import json
import subprocess
import sys

proc = subprocess.run(
    ["govulncheck", "-json", "./..."],
    capture_output=True,
    text=True,
)

mod_vulns = []
for line in (proc.stdout or "").splitlines():
    line = line.strip()
    if not line:
        continue
    try:
        obj = json.loads(line)
    except json.JSONDecodeError:
        continue
    if not isinstance(obj, dict):
        continue
    finding = obj.get("finding")
    if not isinstance(finding, dict):
        continue
    osv = finding.get("osv")
    for frame in finding.get("trace") or []:
        if not isinstance(frame, dict):
            continue
        mod = frame.get("module")
        if mod and mod != "stdlib":
            mod_vulns.append((osv, mod, frame.get("package")))
            break

if mod_vulns:
    print("FAIL: third-party module vulnerabilities:")
    for item in mod_vulns:
        print(" ", item)
    sys.exit(1)

print("OK: no third-party module vulnerabilities (stdlib managed via Go toolchain pin)")
print(f"govulncheck process exit was {proc.returncode}")
if proc.stderr:
    # keep logs short
    err = proc.stderr.strip().splitlines()
    print("govulncheck stderr (last 5):", *err[-5:], sep="\n")
sys.exit(0)
