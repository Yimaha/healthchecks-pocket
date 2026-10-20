#!/usr/bin/env bash
# Fails when this checkout's line coverage is below a base commit's: a change may not lower it (TESTING.md).
#
#   scripts/line-coverage-not-lower.sh <base-commit>
#
# This checkout's is coverage/coverage-summary.json, from npm run test:coverage. The base's is measured the same way
# in a worktree of its own, once per commit (.cache/line-coverage/). CI compares a PR with main; npm run check, a
# branch with the commit it started from.
# Run this script; don't source it. Sourcing would leave its settings and
# helpers in your shell, and an error would close the shell.
if [ "${BASH_SOURCE[0]:-}" != "$0" ]; then
  echo "Run scripts/line-coverage-not-lower.sh instead of sourcing it." >&2
  return 1
fi
set -euo pipefail
. "$(dirname "$0")/lib.sh"

[ $# = 1 ] || { sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }
base_commit=$(git -C "$HCP_ROOT" rev-parse --verify --quiet "$1^{commit}") || hcp_die "No commit $1 to compare line coverage with."
checkout_summary="$HCP_ROOT/coverage/coverage-summary.json"
[ -f "$checkout_summary" ] ||
  hcp_die "No coverage/coverage-summary.json to compare: npm run test:coverage writes it (once its tests pass)."

base_summary="$HCP_ROOT/.cache/line-coverage/$base_commit.json"
if [ ! -f "$base_summary" ]; then
  hcp_say "Measuring the line coverage of ${base_commit:0:9} to compare with"
  # Its real path (macOS's temp folder is behind a symlink), as the tests' own paths are.
  base_checkout="$(cd "$(mktemp -d)" && pwd -P)/base"
  trap 'git -C "$HCP_ROOT" worktree remove --force "$base_checkout" > /dev/null 2>&1 || true' EXIT
  git -C "$HCP_ROOT" worktree add --detach --quiet "$base_checkout" "$base_commit"
  # Its own dependencies, as they were then. json-summary named here too: a base from before this script didn't write it.
  (cd "$base_checkout" && npm ci --no-audit --no-fund --loglevel=error &&
    npx vitest run --coverage --coverage.reporter=json-summary --reporter=dot)
  mkdir -p "$(dirname "$base_summary")"
  cp "$base_checkout/coverage/coverage-summary.json" "$base_summary"
fi

line_coverage_pct() { node -p 'require(process.argv[1]).total.lines.pct' "$1"; }
checkout_pct=$(line_coverage_pct "$checkout_summary")
base_pct=$(line_coverage_pct "$base_summary")
# Compared as Vitest reports them, to two decimals: a difference too small to show isn't a drop.
if awk -v checkout="$checkout_pct" -v base="$base_pct" 'BEGIN { exit !(checkout < base) }'; then
  hcp_die "Line coverage fell from $base_pct% (${base_commit:0:9}) to $checkout_pct%. Add tests for the lines this change adds or leaves uncovered (npm run test:coverage; coverage/index.html shows which)."
fi
hcp_say "Line coverage: $checkout_pct%, not below $base_pct% (${base_commit:0:9})"
