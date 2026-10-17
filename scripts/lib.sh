# shellcheck shell=bash
# Shared helpers for scripts/*.sh: finds the tools the Android build needs
# without assuming any particular machine layout. The scripts load this file;
# it isn't meant for your own shell (its helpers would land there, and
# hcp_die would close it). Names are prefixed hcp_/HCP_ to avoid clashes.
# Written for bash 3.2 (the macOS default).

case $- in
  *i*)
    echo "scripts/lib.sh is loaded by the scripts in scripts/; run those instead." >&2
    return 1
    ;;
esac

HCP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HCP_JAVA_MAJOR=21 # Gradle 8.14 (used by Capacitor 8) can't run on newer JDKs

hcp_say() { printf '\033[1m==> %s\033[0m\n' "$*"; }
hcp_warn() { printf '\033[33mwarning:\033[0m %s\n' "$*" >&2; }
hcp_die() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }

hcp_os() {
  case "$(uname -s)" in
    Darwin) echo mac ;;
    Linux) echo linux ;;
    MINGW* | MSYS* | CYGWIN*) echo windows ;;
    *) echo unknown ;;
  esac
}

hcp_java_major() { "$1/bin/java" -version 2>&1 | sed -n 's/.*version "\([0-9]*\).*/\1/p' | head -n 1; }

hcp_is_java21() { [ -n "$1" ] && [ -x "$1/bin/java" ] && [ "$(hcp_java_major "$1")" = "$HCP_JAVA_MAJOR" ]; }

# Prints a JAVA_HOME for JDK 21, or nothing. HCP_JAVA_HOME overrides.
hcp_find_java21() {
  local candidate
  for candidate in "${HCP_JAVA_HOME:-}" "${JAVA_HOME:-}"; do
    if hcp_is_java21 "$candidate"; then echo "$candidate"; return; fi
  done
  if [ -x /usr/libexec/java_home ]; then
    candidate=$(/usr/libexec/java_home -v "$HCP_JAVA_MAJOR" 2>/dev/null || true)
    if hcp_is_java21 "$candidate"; then echo "$candidate"; return; fi
  fi
  if command -v brew > /dev/null 2>&1; then
    candidate=$(brew --prefix "openjdk@$HCP_JAVA_MAJOR" 2>/dev/null || true)
    if hcp_is_java21 "$candidate/libexec/openjdk.jdk/Contents/Home"; then echo "$candidate/libexec/openjdk.jdk/Contents/Home"; return; fi
    if hcp_is_java21 "$candidate"; then echo "$candidate"; return; fi
  fi
  for candidate in "$HOME"/.sdkman/candidates/java/21* /usr/lib/jvm/*21* /Library/Java/JavaVirtualMachines/*21*/Contents/Home; do
    if hcp_is_java21 "$candidate"; then echo "$candidate"; return; fi
  done
}

# Prints the Android SDK directory, or nothing.
hcp_find_android_sdk() {
  local candidate from_props=""
  [ -f "$HCP_ROOT/android/local.properties" ] && from_props=$(sed -n 's/^sdk\.dir=//p' "$HCP_ROOT/android/local.properties")
  for candidate in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" "$from_props" \
    "$HOME/Library/Android/sdk" "$HOME/Android/Sdk"; do
    if [ -n "$candidate" ] && [ -d "$candidate" ]; then echo "$candidate"; return; fi
  done
  if command -v brew > /dev/null 2>&1; then
    candidate="$(brew --prefix)/share/android-commandlinetools"
    if [ -d "$candidate" ]; then echo "$candidate"; return; fi
  fi
}

# hcp_sdk_tool <sdk-dir> <sdkmanager|avdmanager>: path to the tool, or nothing.
hcp_sdk_tool() {
  local tool
  for tool in "$1/cmdline-tools/latest/bin/$2" "$1/cmdline-tools/bin/$2"; do
    if [ -x "$tool" ]; then echo "$tool"; return; fi
  done
  command -v "$2" 2> /dev/null || true
}

# Exports JAVA_HOME and ANDROID_HOME for the build, or explains what's missing.
hcp_load_env() {
  local jh sdk
  jh=$(hcp_find_java21)
  [ -n "$jh" ] || hcp_die "JDK $HCP_JAVA_MAJOR not found. Run scripts/setup.sh (or set HCP_JAVA_HOME)."
  sdk=$(hcp_find_android_sdk)
  [ -n "$sdk" ] || hcp_die "Android SDK not found. Run scripts/setup.sh (or set ANDROID_HOME)."
  export JAVA_HOME="$jh" ANDROID_HOME="$sdk" ANDROID_SDK_ROOT="$sdk"
  export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
}

hcp_sha256() {
  if command -v sha256sum > /dev/null 2>&1; then sha256sum "$@"; else shasum -a 256 "$@"; fi
}

hcp_sha1() {
  if command -v sha1sum > /dev/null 2>&1; then sha1sum "$@"; else shasum -a 1 "$@"; fi
}

# The emulator is shared by every checkout on this machine, and a run on it (the emulator tests, the demo-media
# scripts) reinstalls the app or clears its data, so two at once break each other. hcp_emulator_lock takes the
# machine-wide lock for this script's run. If another run holds it, it doesn't wait: it returns 75 with a warning
# naming that run, so whoever started this one waits for it and runs again.
#
# It's the system's file lock (flock on Linux, lockf on macOS) on HCP_EMULATOR_LOCK, through file descriptor 9, which
# the script keeps open: the system lets one process hold it, and releases it when the script exits, however it ends
# (even kill -9). The file's text only names the run holding it, for that warning. The processes the script starts
# inherit descriptor 9, and the lock with it: start one that outlives the run (an emulator) with 9>&-.
HCP_EMULATOR_LOCK=${HCP_EMULATOR_LOCK:-/tmp/healthchecks-pocket-emulator.lock}

hcp_emulator_lock() {
  local pid="" since="" checkout="" taken=0
  read -r pid since checkout <<< "$(cat "$HCP_EMULATOR_LOCK" 2> /dev/null)"
  # Held for this run by the run that started it (npm run check, for the emulator tests).
  if [ -n "$pid" ] && [ "$pid" = "${HCP_EMULATOR_LOCKED_BY:-}" ] && kill -0 "$pid" 2> /dev/null; then return 0; fi
  # An adb server started while this run holds the lock would keep it after the run: start it first.
  if command -v adb > /dev/null 2>&1; then adb start-server > /dev/null 2>&1 || true; fi
  { exec 9>> "$HCP_EMULATOR_LOCK"; } 2> /dev/null || { hcp_warn "Can't open the emulator lock $HCP_EMULATOR_LOCK."; return 1; }
  # Taken at once or not at all.
  if [ "$(hcp_os)" = mac ]; then
    lockf -s -t 0 9 && taken=1
  else
    flock -n 9 && taken=1
  fi
  if [ "$taken" = 1 ]; then
    printf '%s %s %s\n' "$$" "$(date +%H:%M:%S)" "$HCP_ROOT" > "$HCP_EMULATOR_LOCK"
    export HCP_EMULATOR_LOCKED_BY=$$ # for the scripts this run starts
    return 0
  fi
  exec 9>&-
  read -r pid since checkout <<< "$(cat "$HCP_EMULATOR_LOCK" 2> /dev/null)"
  if [ -n "$pid" ] && kill -0 "$pid" 2> /dev/null; then
    hcp_warn "The emulator is in use: $checkout has been running on it since $since (PID $pid). Wait until it's done, then run this again."
  elif [ -n "$pid" ]; then
    hcp_warn "The emulator lock is held by a process that the run from $checkout (PID $pid, ended) started, and that outlived it. Find it with: lsof $HCP_EMULATOR_LOCK"
  else
    hcp_warn "The emulator is in use: another run is just starting on it. Wait until it's done, then run this again."
  fi
  return 75
}

# Release the lock before this script ends (closing the descriptor; for a run it was held for, its own run still holds it).
hcp_emulator_unlock() {
  exec 9>&-
  unset HCP_EMULATOR_LOCKED_BY
}
