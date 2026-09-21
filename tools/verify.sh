#!/usr/bin/env bash
# Everything that can be checked without spending a transaction.
#
# Run from the repository root:  bash tools/verify.sh
#
# It is deliberately the SHORT loop: the offline suite, the repository audit,
# the GenVM lint, the frontend typecheck and build, and the deployed source
# checksums. The long loop — `node test/seed.mjs` — costs half an hour of real
# consensus rounds and is what produces docs/EVIDENCE.md.
set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
step() {
  printf '\n\033[1m==> %s\033[0m\n' "$1"
}
result() {
  if [ "$1" -eq 0 ]; then printf '    ok\n'; else printf '    FAILED\n'; fail=1; fi
}

step "offline suite (no chain, no network, no model)"
python3 test/test_logic.py 2>&1 | tail -3
result "${PIPESTATUS[0]}"

step "repository audit and the rejection ledger"
python3 tools/audit.py 2>&1 | tail -3
result "${PIPESTATUS[0]}"

step "GenVM lint"
if command -v genvm-lint >/dev/null 2>&1; then
  genvm-lint check contracts/GrantJudge.py 2>&1 | grep -E "Lint|Validation" || true
  genvm-lint check contracts/GrantConsumer.py 2>&1 | grep -E "Lint|Validation" || true
  printf '    (the SDK validator cannot fetch a pinned runner locally — docs/PROBE.md §6)\n'
else
  printf '    genvm-lint not installed; skipped\n'
fi

step "deployed source checksums"
python3 - <<'PY'
import hashlib, json, pathlib, sys
root = pathlib.Path(".")
dep = json.loads((root / "deployments.json").read_text())["deployments"]["studiodev"]
ok = True
for name, src in (("GrantJudge", "contracts/GrantJudge.py"),
                  ("GrantJudgeDemo", "contracts/GrantJudge.py"),
                  ("GrantConsumer", "contracts/GrantConsumer.py")):
    if name not in dep:
        continue
    digest = hashlib.sha256((root / src).read_bytes()).hexdigest()
    match = dep[name].get("source_sha256") == digest
    ok = ok and match
    print(f"    {'ok  ' if match else 'FAIL'} {name:<15} {digest[:16]}…  {dep[name]['address']}")
sys.exit(0 if ok else 1)
PY
result $?

step "the deployed source, read back off the chain"
node test/verify_onchain.mjs
result $?

step "frontend typecheck and production build"
( cd frontend && npx tsc --noEmit && npx next build >/dev/null 2>&1 )
result $?

step "the live app answers"
for path in "" rounds propose create verdicts docs my-proposals; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "https://grantjudge-app.vercel.app/$path" || echo 000)
  printf '    %s  /%s\n' "$code" "$path"
  [ "$code" = "200" ] || fail=1
done

printf '\n'
if [ "$fail" -eq 0 ]; then
  printf '\033[1mALL GREEN\033[0m\n'
else
  printf '\033[1mSOMETHING FAILED\033[0m\n'
fi
exit "$fail"
