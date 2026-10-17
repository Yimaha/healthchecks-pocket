#!/usr/bin/env bash
# Screenshots and a short walkthrough GIF of the app's core pages, made on the
# Android emulator with the built-in demo project (no real API keys, project
# names or servers), into docs/media/. Each file has its own script in
# scripts/demo-media/, which starts from a fresh app; shared.mjs there holds
# the tools they use. Every image is cropped to the app, without Android's
# status and navigation bars. Needs ffmpeg.
#
#   npm run android:emulator           # first, in another terminal
#   scripts/demo-media.sh              # every file
#   scripts/demo-media.sh ping-body    # only some (names of scripts in scripts/demo-media/)
#
# Each script clears the app's data on the emulator to start fresh, so they
# refuse to run on a real phone.
# Run this script; don't source it. Sourcing would leave its settings and
# helpers in your shell, and an error would close the shell.
if [ "${BASH_SOURCE[0]:-}" != "$0" ]; then
  echo "Run scripts/demo-media.sh instead of sourcing it." >&2
  return 1
fi
set -euo pipefail
. "$(dirname "$0")/lib.sh"

hcp_load_env
debug_apk="$HCP_ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
media_scripts_dir="$HCP_ROOT/scripts/demo-media"
if [ $# -gt 0 ]; then
  media_names=("$@")
else
  media_names=(check-list check-detail ping-body settings walkthrough heartbeat)
fi
for media_name in "${media_names[@]}"; do
  [ -f "$media_scripts_dir/$media_name.mjs" ] || hcp_die "No script for \"$media_name\" (scripts/demo-media/$media_name.mjs)."
done

command -v ffmpeg > /dev/null 2>&1 || hcp_die "ffmpeg not found; it crops the screenshots and makes the GIF. Install it (macOS: brew install ffmpeg)."
# One run at a time on the shared emulator (the emulator tests clear the app's data too), from before it's checked for
# until this run ends.
hcp_emulator_lock || exit $?
adb get-state > /dev/null 2>&1 || hcp_die "No emulator running. Start one with: npm run android:emulator"
# The scripts clear the app's data, which on a real phone would delete its projects and API keys.
[ "$(adb shell getprop ro.kernel.qemu | tr -d '\r')" = 1 ] || hcp_die "That's a real device; this runs on the emulator only."

# Built and installed once: every script then starts this same app afresh.
hcp_say "Building and installing the debug app"
"$HCP_ROOT/scripts/android.sh" build
adb install -r "$debug_apk" > /dev/null

for media_name in "${media_names[@]}"; do
  hcp_say "$media_name"
  node "$media_scripts_dir/$media_name.mjs"
done
# Which version the media shows (MAJOR.MINOR), to tell when it's due for a refresh.
node -p 'require("./package.json").version.split(".").slice(0, 2).join(".")' > "$HCP_ROOT/docs/media/VERSION"
