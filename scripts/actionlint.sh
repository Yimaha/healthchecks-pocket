#!/usr/bin/env bash
# Lint the GitHub workflows with actionlint: syntax, `needs:` and expressions,
# action inputs, and the shell in `run:` steps (with the pinned ShellCheck,
# scripts/shellcheck.sh). Uses a pinned official release from
# github.com/rhysd/actionlint, downloaded once into .cache/ (gitignored) and
# verified against the SHA-256 below before it's ever run, like
# scripts/shellcheck.sh.
#
#   scripts/actionlint.sh              lint .github/workflows/*.yml
#   scripts/actionlint.sh <args>       run the pinned actionlint with <args>
#
# To upgrade: bump HCP_AL_VERSION and replace the four hashes with the
# SHA-256 of the new release archives (actionlint_<version>_checksums.txt).

# Run this script; don't source it. Sourcing would leave its settings and
# helpers in your shell, and an error would close the shell.
if [ "${BASH_SOURCE[0]:-}" != "$0" ]; then
  echo "Run scripts/actionlint.sh instead of sourcing it." >&2
  return 1
fi
set -euo pipefail
. "$(dirname "$0")/lib.sh"

HCP_AL_VERSION=1.7.12
# Where releases are downloaded from (overridable for tests).
HCP_AL_BASE_URL=${HCP_AL_BASE_URL:-https://github.com/rhysd/actionlint/releases/download}

case "$(hcp_os)-$(uname -m)" in
  mac-arm64) arch=darwin_arm64 sum=aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f ;;
  mac-x86_64) arch=darwin_amd64 sum=5b44c3bc2255115c9b69e30efc0fecdf498fdb63c5d58e17084fd5f16324c644 ;;
  linux-x86_64) arch=linux_amd64 sum=8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8 ;;
  linux-aarch64 | linux-arm64) arch=linux_arm64 sum=325e971b6ba9bfa504672e29be93c24981eeb1c07576d730e9f7c8805afff0c6 ;;
  *) hcp_die "No pinned actionlint build for $(uname -s) $(uname -m)." ;;
esac

# Download cache (overridable for tests).
cache=${HCP_AL_CACHE:-$HCP_ROOT/.cache}
dir="$cache/actionlint-$HCP_AL_VERSION-$arch"
bin="$dir/actionlint"

if [ ! -x "$bin" ]; then
  archive="actionlint_${HCP_AL_VERSION}_$arch.tar.gz"
  hcp_say "Downloading actionlint $HCP_AL_VERSION ($arch)"
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT
  curl -fsSL -o "$tmp/$archive" "$HCP_AL_BASE_URL/v$HCP_AL_VERSION/$archive" ||
    hcp_die "Couldn't download $archive."
  actual=$(hcp_sha256 "$tmp/$archive" | cut -d' ' -f1)
  [ "$actual" = "$sum" ] ||
    hcp_die "Checksum mismatch for $archive (expected $sum, got $actual). Not running it."
  tar -xzf "$tmp/$archive" -C "$tmp" actionlint
  mkdir -p "$dir"
  mv "$tmp/actionlint" "$bin"
  chmod +x "$bin"
fi

if [ $# -gt 0 ]; then
  exec "$bin" "$@"
fi
cd "$HCP_ROOT"
# The pinned ShellCheck, downloaded first: actionlint reads its output, which a download message would spoil.
"$HCP_ROOT/scripts/shellcheck.sh" --version > /dev/null
# No pyflakes: the workflows have no Python steps, and a pyflakes on PATH would make results differ by machine.
"$bin" -shellcheck="$HCP_ROOT/scripts/shellcheck.sh" -pyflakes=
hcp_say "actionlint $HCP_AL_VERSION: .github/workflows are clean"
