#!/usr/bin/env bash
# Build, install and run the Android app (after scripts/setup.sh).
#
#   scripts/android.sh build           debug APK
#   scripts/android.sh release         signed release APK in release/ (see misc.md)
#   scripts/android.sh unsigned        unsigned release APK in release/ (the release workflow signs it in isolation)
#   scripts/android.sh verify-release  the release APK's checks on an unsigned release build, publishing nothing
#   scripts/android.sh emulator        start the emulator (scripts/setup.sh --emulator)
#   scripts/android.sh run             build and launch on an emulator or device
#   scripts/android.sh phone           build, install and open on a USB-connected phone
#   scripts/android.sh test            build, install and test the debug app on the emulator
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
  build | release | unsigned | verify-release | emulator | run | phone | test) ;;
  *) sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac

hcp_load_env
app_id=$(sed -n "s/.*appId: *'\([^']*\)'.*/\1/p" "$HCP_ROOT/capacitor.config.ts")
debug_apk="$HCP_ROOT/android/app/build/outputs/apk/debug/app-debug.apk"

web() { (cd "$HCP_ROOT" && npm run build && npx cap sync android); }
gradle() { (cd "$HCP_ROOT/android" && ./gradlew --quiet "$@"); }
build_tool() { "$(printf '%s\n' "$ANDROID_HOME"/build-tools/* | sort -V | tail -n 1)/$1" "${@:2}"; }
apksigner() { build_tool apksigner "$@"; }
aapt2() { build_tool aapt2 "$@"; }

# check_backup_rules <apk> <manifest attribute> <resource name>: the merged manifest (a library's manifest could
# replace the app's attribute) uses the app's rules, and every version of them (res/xml, res/xml-v28) names only the
# two Preferences files meant for backup (src/platform/native.ts). Release builds shorten resource file names
# (res/xml/backup_rules.xml becomes e.g. res/Qq.xml), so the files are found through the resource table.
check_backup_rules() {
  local apk=$1 attribute=$2 resource=$3 resource_id rules_files rules_file rules path
  resource_id=$(aapt2 dump xmltree --file AndroidManifest.xml "$apk" | sed -n "s/.*android:$attribute([^)]*)=@\(0x[0-9a-f]*\).*/\1/p")
  [ -n "$resource_id" ] || hcp_die "release APK: the manifest has no android:$attribute"
  # `resource 0x7f100000 xml/backup_rules`, then one `(v28) (file) res/xo.xml type=XML` line per version.
  rules_files=$(aapt2 dump resources "$apk" | awk -v id="$resource_id" -v name="$resource" \
    '$1 == "resource" { inside = ($2 == id && $3 == name); next } inside && $2 == "(file)" { print $3 }')
  [ -n "$rules_files" ] || hcp_die "release APK: android:$attribute isn't the app's $resource"
  for rules_file in $rules_files; do
    rules=$(aapt2 dump xmltree --file "$rules_file" "$apk")
    # Rules without an <include> would back up everything.
    grep -q 'E: include' <<< "$rules" || hcp_die "release APK: $resource ($rules_file) includes nothing, so everything is backed up"
    if sed -n 's/.*A: domain="\([^"]*\)".*/\1/p' <<< "$rules" | grep -vx sharedpref > /dev/null; then
      hcp_die "release APK: $resource ($rules_file) backs up more than Preferences files"
    fi
    while IFS= read -r path; do
      case "$path" in
        CapacitorStorage.xml | CarriedApiKeys.xml) ;;
        *) hcp_die "release APK: $resource ($rules_file) backs up $path" ;;
      esac
    done < <(sed -n 's/.*A: path="\([^"]*\)".*/\1/p' <<< "$rules")
  done
}

# check_release_apk <apk> [unsigned]: what a release build must be before it's published. Signed (skipped for
# `unsigned`: the keyless build, which verify-release and the workflow's build-unsigned job check), not debuggable,
# and backing up only the two Preferences files.
check_release_apk() {
  local apk=$1 badging
  if [ "${2:-}" != unsigned ]; then
    apksigner verify "$apk" || hcp_die "release APK failed signature verification"
  fi
  badging=$(aapt2 dump badging "$apk")
  if grep -qx 'application-debuggable' <<< "$badging"; then hcp_die "release APK is debuggable"; fi
  check_backup_rules "$apk" fullBackupContent xml/backup_rules
  check_backup_rules "$apk" dataExtractionRules xml/data_extraction_rules
}

case "$cmd" in
  build)
    web
    gradle assembleDebug
    hcp_say "Debug APK: ${debug_apk#"$HCP_ROOT"/}"
    ;;

  unsigned)
    # Job A of the release workflow. Builds the release APK WITHOUT the signing key (-PhcpUnsigned forces an unsigned
    # build even if a key is present) and stages it in release/ for the separate signing job, which only zipaligns
    # and signs it with apksigner. That way no npm/Gradle third-party code ever shares a job with the key.
    # (verify-release runs the same checks but keeps its build out of release/; this is the artifact to be signed.)
    web
    gradle assembleRelease -PhcpUnsigned
    appVersion=$(node -p "require('$HCP_ROOT/package.json').version")
    unsignedApkName="healthchecks-pocket-$appVersion-unsigned.apk"
    mkdir -p "$HCP_ROOT/release"
    cp "$HCP_ROOT/android/app/build/outputs/apk/release/app-release-unsigned.apk" "$HCP_ROOT/release/$unsignedApkName"
    check_release_apk "$HCP_ROOT/release/$unsignedApkName" unsigned
    hcp_say "Unsigned release APK: release/$unsignedApkName"
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
    check_release_apk "$HCP_ROOT/release/$name"
    (cd "$HCP_ROOT/release" && hcp_sha256 "$name" > "$name.sha256")
    hcp_say "Release APK: release/$name"
    apksigner verify --print-certs "$HCP_ROOT/release/$name" | grep -E 'SHA-256 digest' | head -n 1
    ;;

  verify-release)
    # The release's checks (check_release_apk) on a release build, before releasing. Always unsigned, so it needs
    # no signing key (the release job checks the signature), and it stays in android/app/build/: nothing appears in
    # release/ that could pass for a real release.
    web
    gradle assembleRelease -PhcpUnsigned
    apk="$HCP_ROOT/android/app/build/outputs/apk/release/app-release-unsigned.apk"
    check_release_apk "$apk" unsigned
    hcp_say "Release build checked (unsigned, so not its signature): ${apk#"$HCP_ROOT"/}"
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

  test)
    # One run at a time on the shared emulator, from before it's checked for until this run ends; taken before
    # building, so a second run says so at once.
    hcp_emulator_lock || exit $?
    # The tests clear the app's data, which on a real phone would delete its projects and API keys: `adb -e` picks
    # the emulator even with a phone plugged in too, and the tests check again (tests/android/device.ts).
    adb -e get-state > /dev/null 2>&1 || hcp_die "No emulator running. Start one with: npm run android:emulator"
    web
    gradle assembleDebug
    adb -e install -r "$debug_apk" > /dev/null
    serial=$(adb -e get-serialno | tr -d '\r')
    (cd "$HCP_ROOT" && ANDROID_SERIAL="$serial" npx playwright test -c playwright.android.config.ts "$@")
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
