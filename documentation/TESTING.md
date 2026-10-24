# Testing

How to test a change before it's pushed. `npm run check` runs the checks your change needs, and CI runs them again on
the PR, the emulator tests included.

## Before you push

1. **Before changing anything, decide which test will prove the change**, and add or update it first. When you can,
   see it fail before the change and pass after.

   | The change | Its test |
   |---|---|
   | Logic: the API client, formatting, saved settings and keys (`src/core`) | `tests/unit` |
   | A screen or a component (`src/ui`, `src/app`) | `tests/ui`, in the same folder as in `src` (`tests/ui/pages/settings` for `src/ui/pages/settings`) |
   | A flow in the browser, with the fake healthchecks.io (`tests/fixtures/fake-api.ts`) | `tests/e2e` |
   | Android only: what's stored on the phone, the Back button, Capacitor plugins, logcat | `tests/android` |
   | A shell script (`scripts/`) | `tests/unit/scripts.test.ts`, with a fake SDK and JDK |
   | What the release APK is: debuggable or not, its backup rules | `check_release_apk` in `scripts/android.sh`, and `tests/unit/backup-rules.test.ts` |
   | A workflow (`.github/workflows`) | actionlint (in `npm run lint`), then one real GitHub run (below) |

2. Make the change.
3. **Run `npm run check` and fix what fails.** It needs up to about 6 minutes when the emulator tests run, so agents
   give it a long timeout or run it in the background.
4. **Push once it passes.** If you change anything after, run it again first.
5. **If the change touches something only CI can check** (below), get a real GitHub run before it's merged, and say
   so in the PR.
6. **In the PR description, list what ran:** tick the template's Tests lines that ran, from the table
   `npm run check` prints at the end.

## What `npm run check` runs

It always runs `npm run build`, `npm run lint` (oxlint, ESLint, ShellCheck, actionlint) and `npm run test:coverage`
(the unit and screen tests, which fail below the line coverage floor). The rest depend on what changed since
`origin/main`, committed or not:

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

## Line coverage

Line coverage of `src/` by the unit and screen tests may not fall below 95.99% (`thresholds` in `vite.config.ts`), and
a change may not lower it at all. CI checks that on a PR: its `test` job measures `main`'s line coverage the same way,
in a checkout of its own, and fails if the PR's is lower. If yours is lower, add tests for the lines your change adds
or leaves uncovered: `coverage/index.html` (from `npm run test:coverage`) shows which.

A PR merges only once CI's `test` and `build` jobs pass on it, up to date with `main` (the "Require CI on main"
ruleset), so it's compared with the `main` it merges into. When `main` moves on, update the branch and let CI run again.

## Only CI can check

- **How a workflow behaves on GitHub:** triggers, `needs:` between jobs, the `release` environment's approval,
  secrets, permissions, runner images. actionlint checks the files; a workflow change also needs one real run.
- **Line coverage not lowered:** the `test` job, on a PR (Line coverage, above).
- **Linux on x86:** CI runs Ubuntu (GNU `sed` and `awk`, bash 5, an x86_64 emulator image that runs about twice as
  slow). A Mac may be arm64, with BSD tools and bash 3.2. The scripts are written for both, but only CI runs Linux.
- **`scripts/setup.sh` on a fresh machine:** CI's build job. Locally it finds everything installed already.
- **Signing with the release key:** the release job, on a version tag. `npm run android:verify-release` checks an
  unsigned build.

## Stacked PRs

A PR based on another PR's branch merges into that branch, not `main`. As soon as the PR below it merges, retarget it
(`gh pr edit <number> --base main`) before it's merged.
