#!/usr/bin/env bash
# The checks a change needs before it's pushed (TESTING.md), run locally and chosen by the files it touches.
#
#   scripts/check.sh           the checks for what changed since origin/main (npm run check)
#   scripts/check.sh --all     every check (npm run test:all)
#   scripts/check.sh --list    which checks would run, and why; runs nothing
#
# When every check passes and nothing is uncommitted, the tested tree is recorded in .cache/checks-passed, and the
# pre-push hook (.githooks/pre-push) lets a push of that tree through without running them again.
# Run this script; don't source it. Sourcing would leave its settings and
# helpers in your shell, and an error would close the shell.
if [ "${BASH_SOURCE[0]:-}" != "$0" ]; then
  echo "Run scripts/check.sh instead of sourcing it." >&2
  return 1
fi
set -euo pipefail
. "$(dirname "$0")/lib.sh"

mode=changed
list=0
for arg in "$@"; do
  case "$arg" in
    --all) mode=all ;;
    --list) list=1 ;;
    *) sed -n '2,6p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
  esac
done
cd "$HCP_ROOT"

# Logs and the record of passed trees (overridable for tests, so they never record a tree as passed).
cache=${HCP_CHECK_CACHE:-$HCP_ROOT/.cache}

# What changed: HCP_CHANGED_FILES (one per line, for the tests), or everything since this branch left origin/main,
# committed or not, untracked files included.
if [ -n "${HCP_CHANGED_FILES:-}" ]; then
  changed=$HCP_CHANGED_FILES
  since="HCP_CHANGED_FILES"
elif base=$(git merge-base origin/main HEAD 2> /dev/null); then
  changed=$(git diff --name-only "$base"; git ls-files --others --exclude-standard)
  since="origin/main"
else
  hcp_warn "No origin/main to compare with (git fetch origin?), so every check runs."
  changed=""
  since="(no origin/main)"
  mode=all
fi

# The checks, in the order they run: name, command, and the changed paths that need it (globs; "always": every
# change). What each covers: TESTING.md.
checks=(build lint unit e2e emulator release-apk setup)
# set_command <check>: its command, in the array `command`.
set_command() {
  case "$1" in
    build) command=(npm run build) ;;
    lint) command=(npm run lint) ;;
    unit) command=(npm test) ;;
    e2e) command=(npm run test:e2e) ;;
    emulator) command=(npm run test:emulator) ;;
    release-apk) command=(npm run android:verify-release) ;;
    setup) command=(npm run setup -- --yes) ;;
  esac
}
paths_of() {
  case "$1" in
    build | lint | unit) echo "always" ;;
    e2e) echo "src/* public/* index.html vite.config.ts playwright.config.ts tests/e2e/* tests/fixtures/* package.json package-lock.json tsconfig*" ;;
    emulator) echo "src/* public/* index.html vite.config.ts capacitor.config.ts android/* tests/android/* tests/fixtures/* playwright.android.config.ts package.json package-lock.json scripts/android.sh scripts/lib.sh" ;;
    release-apk) echo "android/* capacitor.config.ts package.json package-lock.json scripts/android.sh scripts/lib.sh" ;;
    setup) echo "scripts/setup.sh scripts/lib.sh" ;;
  esac
}

# first_changed <glob>...: the first changed file matching one of the globs, or nothing.
first_changed() {
  local file glob
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    for glob in "$@"; do
      # shellcheck disable=SC2254 # the globs are patterns on purpose
      case "$file" in $glob) echo "$file"; return ;; esac
    done
  done <<< "$changed"
}

# why_needed <check>: why the check runs ("always", "--all", "<file> changed"), or nothing if it isn't needed.
why_needed() {
  local paths file
  paths=$(paths_of "$1")
  if [ "$paths" = always ]; then echo "always"; return; fi
  if [ "$mode" = all ]; then echo "--all"; return; fi
  set -f # the globs are for `case`, not for the shell to expand here
  # shellcheck disable=SC2086 # split into one argument per glob
  file=$(first_changed $paths)
  set +f
  if [ -n "$file" ]; then echo "$file changed"; fi
}

# Changes no local check can cover: say what to do instead.
notices() {
  local file
  file=$(first_changed '.github/workflows/*')
  [ -z "$file" ] || echo "$file changed: a workflow change needs one real GitHub run too (TESTING.md)."
  file=$(first_changed 'scripts/demo-media/*')
  [ -z "$file" ] || echo "$file changed: run scripts/demo-media.sh for it on the emulator and look at docs/media."
}

if [ "$list" = 1 ]; then
  for check in "${checks[@]}"; do
    why=$(why_needed "$check")
    if [ -n "$why" ]; then printf '%-12s run: %s\n' "$check" "$why"; else printf '%-12s not needed\n' "$check"; fi
  done
  notices | sed 's/^/notice: /'
  exit 0
fi

# The emulator tests need a running emulator: start the first one headless if there's none, and stop it afterwards.
started_emulator=0
stop_emulator() {
  if [ "$started_emulator" = 1 ]; then adb -e emu kill > /dev/null 2>&1 || true; fi
}
trap stop_emulator EXIT
start_emulator() {
  adb -e get-state > /dev/null 2>&1 && return 0
  [ -n "$("$ANDROID_HOME/emulator/emulator" -list-avds 2> /dev/null | head -n 1)" ] ||
    { echo "No emulator to start. Create one with: scripts/setup.sh --emulator"; return 1; }
  echo "Starting the emulator (headless; stopped when the checks end)"
  "$HCP_ROOT/scripts/android.sh" emulator -no-window -no-audio > "$log_dir/emulator-boot.log" 2>&1 &
  started_emulator=1
  local waited=0
  until [ "$(adb -e shell getprop sys.boot_completed 2> /dev/null | tr -d '\r')" = 1 ]; do
    [ "$waited" -lt 300 ] || { echo "The emulator didn't start in 5 minutes (see $log_dir/emulator-boot.log)."; return 1; }
    sleep 5
    waited=$((waited + 5))
  done
}

log_dir="$cache/checks"
mkdir -p "$log_dir"
results=()
failed=0
for check in "${checks[@]}"; do
  why=$(why_needed "$check")
  if [ -z "$why" ]; then
    results+=("$(printf '  %-11s %-12s' 'not needed' "$check")")
    continue
  fi
  log="$log_dir/$check.log"
  : > "$log" # this run's output only
  set_command "$check"
  hcp_say "$check: ${command[*]}   ($why)"
  status=passed
  if [ "$check" = emulator ]; then
    # hcp_load_env exits when the JDK or SDK is missing: try it in a subshell first, so that fails only this check.
    if (hcp_load_env) >> "$log" 2>&1; then
      hcp_load_env # for adb, here and when stopping the emulator
      start_emulator >> "$log" 2>&1 || status=FAILED
    else
      status=FAILED
    fi
  fi
  if [ "$status" = passed ]; then
    "${command[@]}" >> "$log" 2>&1 < /dev/null || status=FAILED
  fi
  if [ "$status" = FAILED ]; then
    failed=1
    tail -n 30 "$log" | sed 's/^/    /'
    if [ "$check" = emulator ] && [ "$started_emulator" = 1 ]; then
      hcp_warn "The emulator had only just started, and a freshly booted one (or a busy machine) is slow: if a test timed out, run npm run check again before looking further."
    fi
  fi
  results+=("$(printf '  %-11s %-12s %s' "$status" "$check" "$why")")
done

echo
if [ "$mode" = all ]; then hcp_say "Checks: every one"; else hcp_say "Checks for changes since $since"; fi
printf '%s\n' "${results[@]}"
notices | sed 's/^/  notice: /'
echo "  Logs: ${log_dir#"$HCP_ROOT"/}/"

if [ "$failed" = 1 ]; then
  hcp_die "Some checks failed: fix them before pushing."
fi
if [ "$since" = HCP_CHANGED_FILES ]; then
  hcp_say "All checks passed (for the files in HCP_CHANGED_FILES, so not recorded for the pre-push hook)."
elif [ -n "$(git status --porcelain)" ]; then
  hcp_warn "Uncommitted changes: commit them and run npm run check again, so the pre-push hook can let the push through."
else
  echo "$(git rev-parse 'HEAD^{tree}') $(date -u +%Y-%m-%dT%H:%M:%SZ) ${mode}" >> "$cache/checks-passed"
  hcp_say "All checks passed. This tree can be pushed."
fi
