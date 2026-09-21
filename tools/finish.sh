#!/usr/bin/env bash
# The post-seed sequence: settle whatever is still open, read the chain, render
# the evidence.
#
#   bash tools/finish.sh [round-to-settle]
#
# Separate from `seed.mjs` on purpose. The seed drives a demo in one pass; this
# is what you run afterwards — or instead, against a chain somebody else seeded
# — to bring every round to rest and produce docs/EVIDENCE.md from what is
# actually there.
set -uo pipefail
cd "$(dirname "$0")/.."

ROUND="${1:-}"

if [ -n "$ROUND" ]; then
  echo "==> settling round $ROUND"
  node test/settle.mjs --round="$ROUND" --stalled --remainder
fi

echo
echo "==> reading the chain"
node test/collect.mjs
collected=$?

echo
echo "==> rendering docs/EVIDENCE.md"
python3 tools/evidence.py
rendered=$?

echo
echo "==> the short loop"
bash tools/verify.sh

exit $(( collected != 0 || rendered != 0 ))
