# Testing

How to test a change before it's pushed. `npm run check` runs the checks your change needs, and the pre-push hook
(`.githooks/pre-push`, turned on by `scripts/setup.sh`) refuses a push it hasn't passed.

## Before you push

1. **Before changing anything, decide which test will prove the change**, and add or update it first. When you can,
   see it fail before the change and pass after.

   | The change | Its test |
   |---|---|
   | Logic: the API client, formatting, saved settings and keys (`src/core`) | `tests/unit` |
   | A screen or a component (`src/ui`) | `tests/ui` |
   | A flow in the browser, with the fake healthchecks.io (`tests/fixtures/fake-api.ts`) | `tests/e2e` |
   | Android only: what's stored on the phone, the Back button, Capacitor plugins, logcat | `tests/android` |
   | A shell script (`scripts/`, `.githooks/`) | `tests/unit/scripts.test.ts`, with a fake SDK and JDK |
   | What the release APK is: debuggable or not, its backup rules | `check_release_apk` in `scripts/android.sh`, and `tests/unit/backup-rules.test.ts` |
   | A workflow (`.github/workflows`) | actionlint (in `npm run lint`), then one real GitHub run (below) |

2. Make the change.
3. **Run `npm run check` and fix what fails.** It needs up to about 6 minutes when the emulator tests run, so agents
   give it a long timeout or run it in the background.
4. **Commit everything, then push.** The hook lets the push through at once if `npm run check` passed on exactly
   these files, so squashing or rewording commits needs no new run. With uncommitted changes it can't know what was
   tested: commit, and run it again.
5. **If the change touches something only CI can check** (below), get a real GitHub run before it's merged, and say
   so in the PR.
6. **In the PR description, list what ran:** tick the template's Tests lines that ran, from the table
   `npm run check` prints at the end.

Don't skip the hook (`git push --no-verify`) unless the repo's owner says so for that push.

## What `npm run check` runs

It always runs `npm run build`, `npm run lint` (oxlint, ESLint, ShellCheck, actionlint) and `npm test` (the unit and
screen tests). The rest depend on what changed since `origin/main`, committed or not:

| Check | Command | When |
|---|---|---|
| e2e | `npm run test:e2e` | The app (`src/`, `public/`, …), the browser tests or their fixtures, dependencies |
| emulator | `npm run test:emulator` | The app, the Android project, the Capacitor config, the emulator tests, dependencies, `scripts/android.sh` |
| release-apk | `npm run android:verify-release` | The Android project, the Capacitor config, dependencies, `scripts/android.sh` |
| setup | `scripts/setup.sh --yes` | `scripts/setup.sh` or `scripts/lib.sh` |

The exact paths are in `paths_of` in `scripts/check.sh`; `npm run check -- --list` shows which checks a change needs
and why, without running them. `npm run test:all` (the same as `npm run check -- --all`) runs every one: do that
before a release. It also says when
a change needs something no local check covers: a workflow (below) or a demo-media script (`misc.md`).

The emulator tests need an emulator (`scripts/setup.sh --emulator`, once). If none is running, `npm run check`
starts one headless and stops it right after the emulator tests. Every checkout on the machine shares that one
emulator, and each run reinstalls the app or clears its data, so only one runs at a time: a second run stops at once
(exit 75) with *The emulator is in use: <checkout> has been running on it since <time>*, and `npm run check` lists the
emulator check as `IN USE`. Wait until that run is done, then run yours again. `npm run check` holds the lock from
before it looks for an emulator until it has stopped the one it started, so no other run uses or stops it in between.

## Only CI can check

- **How a workflow behaves on GitHub:** triggers, `needs:` between jobs, the `release` environment's approval,
  secrets, permissions, runner images. actionlint checks the files; a workflow change also needs one real run. The
  emulator job runs only on `main`, so to try it on a PR, add a temporary commit that removes its
  `if: github.event_name == 'push'` in `ci.yml`, and drop that commit before merging.
- **Linux on x86:** CI runs Ubuntu (GNU `sed` and `awk`, bash 5, an x86_64 emulator image that runs about twice as
  slow). A Mac may be arm64, with BSD tools and bash 3.2. The scripts are written for both, but only CI runs Linux.
- **`scripts/setup.sh` on a fresh machine:** CI's build job. Locally it finds everything installed already.
- **Signing with the release key:** the release job, on a version tag. `npm run android:verify-release` checks an
  unsigned build.

## Stacked PRs

A PR based on another PR's branch merges into that branch, not `main`. As soon as the PR below it merges, retarget it
(`gh pr edit <number> --base main`) before it's merged.
