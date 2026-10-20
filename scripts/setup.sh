#!/usr/bin/env bash
# One-time setup for building the Android app: checks Node.js, JDK 21 and the
# Android SDK, installs what's missing (asking first), and installs npm
# packages. Safe to re-run.
#
#   scripts/setup.sh              check and install what's missing
#   scripts/setup.sh --yes        don't ask (for CI)
#   scripts/setup.sh --emulator   also install an emulator image and create
#                                 an emulator named "healthchecks-pocket"
# Run this script; don't source it. Sourcing would leave its settings and
# helpers in your shell, and an error would close the shell.
if [ "${BASH_SOURCE[0]:-}" != "$0" ]; then
  echo "Run scripts/setup.sh instead of sourcing it." >&2
  return 1
fi
set -euo pipefail
. "$(dirname "$0")/lib.sh"

YES=0
EMULATOR=0
for arg in "$@"; do
  case "$arg" in
    -y | --yes) YES=1 ;;
    --emulator) EMULATOR=1 ;;
    -h | --help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) hcp_die "unknown option: $arg (see --help)" ;;
  esac
done

# Run as root: directly if we already are (containers), else via sudo.
as_root() { if [ "$(id -u)" = 0 ]; then "$@"; else sudo "$@"; fi; }

confirm() {
  [ "$YES" = 1 ] && return 0
  local reply
  printf '%s [y/N] ' "$1"
  read -r reply
  [ "$reply" = y ] || [ "$reply" = Y ]
}

# ------------------------------------------------------------------ Node.js
hcp_say "Node.js"
command -v node > /dev/null 2>&1 ||
  hcp_die "Node.js not found. Install Node.js $(cat "$HCP_ROOT/.nvmrc") (https://nodejs.org, or 'nvm install' in this folder) and re-run."
node_version=$(node -v)
hcp_node_supported "$node_version" ||
  hcp_die "Node.js $node_version isn't supported: package.json's engines needs $(node -p 'require(process.argv[1]).engines.node' "$HCP_ROOT/package.json"). Install Node.js $(cat "$HCP_ROOT/.nvmrc") (https://nodejs.org, or 'nvm install' in this folder) and re-run."
echo "    node $node_version"

# --------------------------------------------------------------------- JDK
hcp_say "Java $HCP_JAVA_MAJOR"
jh=$(hcp_find_java21)
if [ -z "$jh" ]; then
  case "$(hcp_os)" in
    mac)
      command -v brew > /dev/null 2>&1 || hcp_die "JDK $HCP_JAVA_MAJOR not found. Install it (https://adoptium.net) and re-run."
      confirm "JDK $HCP_JAVA_MAJOR not found. Install it with Homebrew (brew install openjdk@$HCP_JAVA_MAJOR)?" &&
        brew install "openjdk@$HCP_JAVA_MAJOR"
      ;;
    linux)
      if command -v apt-get > /dev/null 2>&1; then
        confirm "JDK $HCP_JAVA_MAJOR not found. Install it with apt (openjdk-$HCP_JAVA_MAJOR-jdk-headless)?" &&
          as_root apt-get update -qq && as_root apt-get install -y -qq "openjdk-$HCP_JAVA_MAJOR-jdk-headless"
      elif command -v dnf > /dev/null 2>&1; then
        confirm "JDK $HCP_JAVA_MAJOR not found. Install it with dnf (java-$HCP_JAVA_MAJOR-openjdk-devel)?" &&
          as_root dnf install -y "java-$HCP_JAVA_MAJOR-openjdk-devel"
      fi
      ;;
  esac
  jh=$(hcp_find_java21)
  [ -n "$jh" ] || hcp_die "JDK $HCP_JAVA_MAJOR not found. Install it (https://adoptium.net) or point HCP_JAVA_HOME at it, then re-run."
fi
echo "    $jh"
export JAVA_HOME="$jh"

# ------------------------------------------------------------- Android SDK
install_cmdline_tools() {
  local sdk=$1 key zip tmp tools_listing expected_sha1 actual_sha1
  # Where Google's SDK downloads are (overridable for tests).
  local repository_url=${HCP_SDK_REPOSITORY_URL:-https://dl.google.com/android/repository}
  if ! command -v unzip > /dev/null 2>&1; then
    if command -v apt-get > /dev/null 2>&1 && confirm "unzip is needed. Install it with apt?"; then
      as_root apt-get update -qq && as_root apt-get install -y -qq unzip
    else
      hcp_die "unzip is needed to install the Android SDK tools. Install it and re-run."
    fi
  fi
  case "$(hcp_os)-$(uname -m)" in
    mac-arm64) key=mac_arm64 ;;
    mac-*) key=mac_x86_64 ;;
    linux-*) key=linux ;;
    *) hcp_die "Can't install the Android SDK automatically here. Install Android Studio, set ANDROID_HOME, and re-run." ;;
  esac
  # Look the current download up in Google's SDK index instead of pinning one.
  tmp=$(mktemp -d)
  curl -fsSL -o "$tmp/index.xml" "$repository_url/repository2-3.xml"
  # The index lists each download's SHA-1 on the line before its URL.
  tools_listing=$(grep -B1 -m1 "<url>commandlinetools-$key-[0-9]*_latest\.zip</url>" "$tmp/index.xml" || true)
  zip=$(echo "$tools_listing" | sed -n 's|.*<url>\(.*\)</url>.*|\1|p')
  expected_sha1=$(echo "$tools_listing" | sed -n 's|.*<checksum type="sha1">\([0-9a-f]*\)</checksum>.*|\1|p')
  if [ -z "$zip" ] || [ -z "$expected_sha1" ]; then hcp_die "Couldn't find the Android command-line tools download."; fi
  curl -fL --progress-bar -o "$tmp/tools.zip" "$repository_url/$zip"
  actual_sha1=$(hcp_sha1 "$tmp/tools.zip" | cut -d' ' -f1)
  [ "$actual_sha1" = "$expected_sha1" ] ||
    hcp_die "Checksum mismatch for $zip (expected $expected_sha1, got $actual_sha1). Not installing it."
  unzip -q "$tmp/tools.zip" -d "$tmp"
  mkdir -p "$sdk/cmdline-tools"
  rm -rf "$sdk/cmdline-tools/latest"
  mv "$tmp/cmdline-tools" "$sdk/cmdline-tools/latest"
  rm -rf "$tmp"
}

hcp_say "Android SDK"
sdk=$(hcp_find_android_sdk)
if [ -z "$sdk" ] || [ -z "$(hcp_sdk_tool "$sdk" sdkmanager)" ]; then
  if [ -z "$sdk" ]; then
    if [ "$(hcp_os)" = mac ]; then sdk="$HOME/Library/Android/sdk"; else sdk="$HOME/Android/Sdk"; fi
  fi
  confirm "Android SDK tools not found. Download Google's command-line tools into $sdk?" ||
    hcp_die "The Android SDK is needed. Install Android Studio (or the command-line tools), set ANDROID_HOME, and re-run."
  install_cmdline_tools "$sdk"
fi
sdkmanager=$(hcp_sdk_tool "$sdk" sdkmanager)
echo "    $sdk"

# Command-line tools 23+ turn sdkmanager into a front end for Google's new
# `android` CLI, which records usage metrics unless given --no-metrics.
# sdkmanager runs whatever ANDROID_CLI_BIN points to, so point it at a wrapper
# that adds the flag. (Older tools don't use the CLI and ignore this.)
android_cli="$(dirname "$sdkmanager")/android"
if [ -x "$android_cli" ]; then
  cli_dir=$(mktemp -d)
  trap 'rm -rf "$cli_dir"' EXIT
  printf '#!/bin/sh\nexec "%s" --no-metrics "$@"\n' "$android_cli" > "$cli_dir/android"
  chmod +x "$cli_dir/android"
  export ANDROID_CLI_BIN="$cli_dir/android"
fi

compile_sdk=$(sed -n 's/.*compileSdkVersion *= *\([0-9]*\).*/\1/p' "$HCP_ROOT/android/variables.gradle")
packages="platform-tools platforms;android-$compile_sdk"
if [ "$EMULATOR" = 1 ]; then
  case "$(uname -m)" in arm64 | aarch64) abi=arm64-v8a ;; *) abi=x86_64 ;; esac
  image="system-images;android-$compile_sdk;google_apis;$abi"
  packages="$packages emulator $image"
fi

hcp_say "Android SDK packages ($packages)"
# `yes` exits early on SIGPIPE once sdkmanager stops reading; that's expected.
(yes || true) | "$sdkmanager" --sdk_root="$sdk" --licenses > /dev/null
# Build tools come with the Android Gradle plugin's own auto-download.
# shellcheck disable=SC2086
"$sdkmanager" --sdk_root="$sdk" $packages

# Tell Gradle where the SDK is (android/local.properties is gitignored).
printf 'sdk.dir=%s\n' "$sdk" > "$HCP_ROOT/android/local.properties"

if [ "$EMULATOR" = 1 ]; then
  avd=healthchecks-pocket
  if "$sdk/emulator/emulator" -list-avds 2> /dev/null | grep -qx "$avd"; then
    echo "    emulator \"$avd\" already exists"
  else
    hcp_say "Creating emulator \"$avd\""
    echo no | "$(hcp_sdk_tool "$sdk" avdmanager)" create avd -n "$avd" -k "$image" -d pixel_7 > /dev/null
  fi
fi

# ---------------------------------------------------------------- git hooks
# .githooks/pre-push lets a push through only once npm run check passed (TESTING.md). A hooks path set to something
# else is someone's own choice: say how to turn it on instead of replacing it.
if git -C "$HCP_ROOT" rev-parse --git-dir > /dev/null 2>&1; then
  hcp_say "Git hooks"
  hooks_path=$(git -C "$HCP_ROOT" config --get core.hooksPath || true)
  if [ -z "$hooks_path" ] || [ "$hooks_path" = .githooks ]; then
    git -C "$HCP_ROOT" config core.hooksPath .githooks
    echo "    pre-push: npm run check before every push (TESTING.md)"
  else
    hcp_warn "core.hooksPath is $hooks_path, so .githooks/pre-push is off. To turn it on: git config core.hooksPath .githooks"
  fi
fi

# ------------------------------------------------------------- npm packages
hcp_say "npm packages"
(cd "$HCP_ROOT" && npm ci --no-audit --no-fund)

hcp_say "Ready. Next: npm run android:build (debug APK), or see README.md for the other commands."
