#!/usr/bin/env bash
# Print a version's release notes: its "## <version>" section of
# docs/CHANGELOG.md, which becomes the text of the GitHub release.
#
#   scripts/release-notes.sh 0.4.0     (or v0.4.0)
#
# Fails when docs/CHANGELOG.md has no notes for the version, so a
# release can't go out without them.
# Run this script; don't source it. Sourcing would leave its settings in your
# shell, and an error would close the shell.
if [ "${BASH_SOURCE[0]:-}" != "$0" ]; then
  echo "Run scripts/release-notes.sh instead of sourcing it." >&2
  return 1
fi
set -euo pipefail

version=${1:-}
version=${version#v}
if [ -z "$version" ]; then
  echo "Usage: scripts/release-notes.sh <version>" >&2
  exit 2
fi
changelog="$(cd "$(dirname "$0")/.." && pwd)/docs/CHANGELOG.md"

# The lines between "## <version>" and the next "## ", without the blank
# lines around them.
notes=$(awk -v wanted="$version" '
  /^## / { if (found) exit; if ($2 == wanted) { found = 1; next } }
  found { lines[++count] = $0 }
  END {
    first = 1; while (first <= count && lines[first] ~ /^[[:space:]]*$/) first++
    last = count; while (last >= first && lines[last] ~ /^[[:space:]]*$/) last--
    for (i = first; i <= last; i++) print lines[i]
  }
' "$changelog")

if [ -z "$notes" ]; then
  echo "docs/CHANGELOG.md has no notes for $version: add a \"## $version\" section." >&2
  exit 1
fi
printf '%s\n' "$notes"
