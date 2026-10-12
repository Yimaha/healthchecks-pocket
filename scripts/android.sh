#!/usr/bin/env bash
# Build, install and run the Android app (after scripts/setup.sh).
#
#   scripts/android.sh build      debug APK
#   scripts/android.sh release    signed release APK in release/ (see misc.md)
#   scripts/android.sh emulator   start the emulator (scripts/setup.sh --emulator)
#   scripts/android.sh run        build and launch on an emulator or device
#   scripts/android.sh phone      build, install and open on a USB-connected phone
# Run this script; don't source it. Sourcing would leave its settings and
# helpers in your shell, and an error would close the shell.
if [ "${BASH_SOURCE[0]:-}" != "$0" ]; then
  echo "Run scripts/android.sh instead of sourcing it." >&2
  return 1
fi
set -euo pipefail
. "$(dirname "$0")/lib.sh"

cmd=${1:-}
[ $# -gt 0 ] && shift
case "$cmd" in
  build | release | emulator | run | phone) ;;
  *) sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac

hcp_load_env
app_id=$(sed -n "s/.*appId: *'\([^']*\)'.*/\1/p" "$HCP_ROOT/capacitor.config.ts")
debug_apk="$HCP_ROOT/android/app/build/outputs/apk/debug/app-debug.apk"

web() { (cd "$HCP_ROOT" && npm run build && npx cap sync android); }
gradle() { (cd "$HCP_ROOT/android" && ./gradlew --quiet "$@"); }
apksigner() { "$(printf '%s\n' "$ANDROID_HOME"/build-tools/* | sort -V | tail -n 1)/apksigner" "$@"; }

case "$cmd" in
  build)
    web
    gradle assembleDebug
    hcp_say "Debug APK: ${debug_apk#"$HCP_ROOT"/}"
    ;;

  release)
    if [ ! -f "$HCP_ROOT/android/keystore.properties" ] && [ -z "${HCP_KEYSTORE_FILE:-}" ]; then
      hcp_die "No signing key. Create one with scripts/make-keystore.sh, or set the HCP_KEYSTORE_* variables (see android/app/build.gradle)."
    fi
    web
    gradle assembleRelease
    version=$(node -p "require('$HCP_ROOT/package.json').version")
    name="healthchecks-pocket-$version.apk"
    mkdir -p "$HCP_ROOT/release"
    cp "$HCP_ROOT/android/app/build/outputs/apk/release/app-release.apk" "$HCP_ROOT/release/$name"
    apksigner verify "$HCP_ROOT/release/$name" || hcp_die "release APK failed signature verification"
    (cd "$HCP_ROOT/release" && hcp_sha256 "$name" > "$name.sha256")
    hcp_say "Release APK: release/$name"
    apksigner verify --print-certs "$HCP_ROOT/release/$name" | grep -E 'SHA-256 digest' | head -n 1
    ;;

  emulator)
    avd=${HCP_AVD:-$("$ANDROID_HOME/emulator/emulator" -list-avds 2> /dev/null | head -n 1)}
    [ -n "$avd" ] || hcp_die "No emulator yet. Create one with: scripts/setup.sh --emulator"
    exec "$ANDROID_HOME/emulator/emulator" -avd "$avd" -no-snapshot-save -no-boot-anim "$@"
    ;;

  run)
    web
    (cd "$HCP_ROOT" && npx cap run android "$@")
    ;;

  phone)
    adb -d get-state > /dev/null 2>&1 ||
      hcp_die "No phone found over USB. Enable USB debugging, plug it in and accept the prompt on the phone (check: adb devices)."
    web
    gradle assembleDebug
    adb -d install -r "$debug_apk"
    adb -d shell monkey -p "$app_id" -c android.intent.category.LAUNCHER 1 > /dev/null
    hcp_say "Installed and opened on $(adb -d shell getprop ro.product.model | tr -d '\r')"
    ;;
esac
