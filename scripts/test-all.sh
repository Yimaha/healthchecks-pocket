#!/usr/bin/env bash
# Every check the repo has, one after another, with a summary at the end: build, lint, unit and screen tests,
# browser tests, and the emulator tests when an emulator is running.
#
#   scripts/test-all.sh      (npm run test:all)
#
# Each step runs even if an earlier one failed, so one run shows everything to fix. Exits 1 if any step failed.
# Run this script; don't source it. Sourcing would leave its settings and
# helpers in your shell, and an error would close the shell.
if [ "${BASH_SOURCE[0]:-}" != "$0" ]; then
  echo "Run scripts/test-all.sh instead of sourcing it." >&2
  return 1
fi
set -euo pipefail
. "$(dirname "$0")/lib.sh"
cd "$HCP_ROOT"

names=()
results=()
failed=0

# step <name> <npm script>: run it and record how it went.
step() {
  hcp_say "$1: npm run $2"
  names+=("$1 (npm run $2)")
  if npm run --silent "$2"; then
    results+=(pass)
  else
    results+=(FAIL)
    failed=1
  fi
}

# `adb -e` finds the emulator even with a phone plugged in too; the emulator tests never run on a phone.
emulator_running() {
  local sdk
  sdk=$(hcp_find_android_sdk)
  [ -n "$sdk" ] && [ -x "$sdk/platform-tools/adb" ] && "$sdk/platform-tools/adb" -e get-state > /dev/null 2>&1
}

step Build build
step Lint lint
step "Unit and screen tests" test
step "Browser tests" test:e2e
if emulator_running; then
  step "Emulator tests" test:emulator
else
  names+=("Emulator tests: no emulator running. Start one with: npm run android:emulator")
  results+=(skipped)
fi

hcp_say Summary
for i in "${!names[@]}"; do
  printf '  %-8s %s\n' "${results[$i]}" "${names[$i]}"
done
exit "$failed"
