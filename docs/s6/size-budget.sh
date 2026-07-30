#!/usr/bin/env sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
cd "$ROOT"
FRONT=apps/desktop/dist
if [ -d "$FRONT" ]; then
  BYTES=$(du -sb "$FRONT" | awk '{print $1}')
  MB=$(awk "BEGIN {printf \"%.2f\", $BYTES/1024/1024}")
  echo "frontend dist: ${MB} MB"
else
  echo "frontend dist missing — run npm run build --workspace=@localvault/desktop"
  exit 1
fi
for p in apps/desktop/src-tauri/target/release/bundle/*/*; do
  [ -e "$p" ] || continue
  echo "bundle: $p ($(du -h "$p" | awk '{print $1}'))"
done
echo "installer target: ≤ 15 MB (plan)"
