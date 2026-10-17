#!/usr/bin/env bash
# Lint the shell scripts with ShellCheck. Uses a pinned official release from
# github.com/koalaman/shellcheck, downloaded once into .cache/ (gitignored)
# and verified against the SHA-256 below before it's ever run, so linting
# doesn't depend on whatever shellcheck (if any) is installed, or on npm.
#
#   scripts/shellcheck.sh              lint scripts/*.sh and the git hooks (.githooks/)
#   scripts/shellcheck.sh <args>       run the pinned shellcheck with <args>
#
# To upgrade: bump HCP_SC_VERSION and replace the four hashes with the
# SHA-256 of the new release archives.

# Run this script; don't source it. Sourcing would leave its settings and
# helpers in your shell, and an error would close the shell.
if [ "${BASH_SOURCE[0]:-}" != "$0" ]; then
  echo "Run scripts/shellcheck.sh instead of sourcing it." >&2
  return 1
fi
set -euo pipefail
. "$(dirname "$0")/lib.sh"

HCP_SC_VERSION=v0.11.0
# Where releases are downloaded from (overridable for tests).
HCP_SC_BASE_URL=${HCP_SC_BASE_URL:-https://github.com/koalaman/shellcheck/releases/download}

case "$(hcp_os)-$(uname -m)" in
  mac-arm64) arch=darwin.aarch64 sum=56affdd8de5527894dca6dc3d7e0a99a873b0f004d7aabc30ae407d3f48b0a79 ;;
  mac-x86_64) arch=darwin.x86_64 sum=3c89db4edcab7cf1c27bff178882e0f6f27f7afdf54e859fa041fca10febe4c6 ;;
  linux-x86_64) arch=linux.x86_64 sum=8c3be12b05d5c177a04c29e3c78ce89ac86f1595681cab149b65b97c4e227198 ;;
  linux-aarch64 | linux-arm64) arch=linux.aarch64 sum=12b331c1d2db6b9eb13cfca64306b1b157a86eb69db83023e261eaa7e7c14588 ;;
  *) hcp_die "No pinned ShellCheck build for $(uname -s) $(uname -m)." ;;
esac

# Download cache (overridable for tests).
cache=${HCP_SC_CACHE:-$HCP_ROOT/.cache}
dir="$cache/shellcheck-$HCP_SC_VERSION-$arch"
bin="$dir/shellcheck"

if [ ! -x "$bin" ]; then
  archive="shellcheck-$HCP_SC_VERSION.$arch.tar.xz"
  hcp_say "Downloading ShellCheck $HCP_SC_VERSION ($arch)"
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT
  curl -fsSL -o "$tmp/$archive" "$HCP_SC_BASE_URL/$HCP_SC_VERSION/$archive" ||
    hcp_die "Couldn't download $archive."
  actual=$(hcp_sha256 "$tmp/$archive" | cut -d' ' -f1)
  [ "$actual" = "$sum" ] ||
    hcp_die "Checksum mismatch for $archive (expected $sum, got $actual). Not running it."
  tar -xJf "$tmp/$archive" -C "$tmp"
  mkdir -p "$dir"
  mv "$tmp/shellcheck-$HCP_SC_VERSION/shellcheck" "$bin"
  chmod +x "$bin"
fi

if [ $# -gt 0 ]; then
  exec "$bin" "$@"
fi
cd "$HCP_ROOT"
"$bin" -x -P scripts scripts/*.sh .githooks/*
hcp_say "ShellCheck $HCP_SC_VERSION: scripts/*.sh and .githooks/* are clean"
