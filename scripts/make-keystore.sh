#!/usr/bin/env bash
# Create the release signing key (once). Android only installs an update over
# an existing install if both are signed with the same key, so keep the
# keystore and its password backed up somewhere safe; losing them means users
# have to uninstall and reinstall.
#
#   scripts/make-keystore.sh [keystore-path]   default: ~/.healthchecks-pocket/release.jks
#
# Writes android/keystore.properties (gitignored) so `scripts/android.sh
# release` can sign. For CI, store the keystore and password as secrets
# instead (see misc.md).
# Run this script; don't source it. Sourcing would leave its settings and
# helpers in your shell, and an error would close the shell.
if [ "${BASH_SOURCE[0]:-}" != "$0" ]; then
  echo "Run scripts/make-keystore.sh instead of sourcing it." >&2
  return 1
fi
set -euo pipefail
. "$(dirname "$0")/lib.sh"
hcp_load_env

dest=${1:-$HOME/.healthchecks-pocket/release.jks}
props="$HCP_ROOT/android/keystore.properties"
[ -e "$dest" ] && hcp_die "$dest already exists. Not overwriting a signing key."
[ -e "$props" ] && hcp_die "$props already exists (it points at another key). Move it away first if you really want a new key."

mkdir -p "$(dirname "$dest")"
chmod 700 "$(dirname "$dest")"
pass=$(openssl rand -hex 24)

# PKCS12 keystores use one password for the store and the key.
"$JAVA_HOME/bin/keytool" -genkeypair -keystore "$dest" -storetype PKCS12 \
  -alias release -keyalg RSA -keysize 4096 -validity 10000 \
  -storepass "$pass" -keypass "$pass" -dname "CN=Healthchecks Pocket" 2> /dev/null
chmod 600 "$dest"

(
  umask 077
  cat > "$props" << EOF
storeFile=$dest
storePassword=$pass
keyAlias=release
keyPassword=$pass
EOF
)

hcp_say "Created $dest"
echo "    Password saved in android/keystore.properties (gitignored)."
echo "    Back up BOTH the keystore and its password now: every future release must be signed with this key."
