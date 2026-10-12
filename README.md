# Healthchecks Pocket

An unofficial Android app for [Healthchecks.io](https://healthchecks.io) and self-hosted
[Healthchecks](https://github.com/healthchecks/healthchecks): see your checks at a glance, read each ping's log
output, and pause or resume monitoring. Anything account-related (creating checks, integrations, project settings)
opens healthchecks.io.

## Features

- **Checks at a glance**: down and late checks first, counts by status, tag filters, refreshes every minute and on
  resume
- **Check detail**: status, last and next ping, schedule and tags, 30-day status changes, and the ping log
- **Ping bodies**: the output a job sent with its ping, with `[ERROR]`, `[WARN]`, `[INFO]` and `[DEBUG]` lines
  highlighted (also `ERROR:` and `level=error`)
- **Edit tags** and **pause/resume** checks (saved to healthchecks.io)
- **Several projects**, including self-hosted servers; pick a **time zone** for timestamps
- **Demo mode**: use the API key `demo` to try it without an account
- Light and dark theme follow the system

## Install

1. Download the latest `healthchecks-pocket-<version>.apk` from the
   [Releases](../../releases) page. Optionally check it against the `.sha256` file next to it.
2. Open it on your phone. Android asks you to allow installs from your browser or file manager the first time.
3. To update, install a newer APK over it. Your projects stay.

Requires Android 7.0 or newer.

### Getting an API key

In healthchecks.io, open your project's **Settings → API Access** and create a key:

- A **regular** key unlocks everything.
- A **read-only** key shows statuses and status changes only. Healthchecks doesn't expose ping logs, pausing or tag
  edits to read-only keys.

Each project has its own key; add each one in the app's Settings.

## Privacy and security

- API keys are stored only on your phone and sent only to the server you entered. The app has no backend, analytics
  or tracking.
- On Android, keys are encrypted with AES-GCM using a key held in the Android Keystore, which can't be exported
  (via [capacitor-secure-storage](https://github.com/aparajita/capacitor-secure-storage)). A copy of the app's data,
  from a backup or a debugging tool, is useless off the device.
- The app's data is excluded from Android backup and phone-to-phone transfer, so on a new phone or after reinstalling,
  you add your projects again.
- In the web version (`npm run dev`), keys are kept unencrypted in browser storage: browsers offer pages no
  equivalent of the Keystore.

Encryption at rest doesn't protect against code running inside the app itself: the key has to be decrypted to call the
API. If you only need statuses, a read-only key limits what a leaked key could do.

## Building from source

You need **Node.js 22.12+**, **JDK 21** and the **Android SDK**. The setup script checks for all three and offers to
install what's missing (Homebrew on macOS, apt or dnf on Linux, Google's command-line tools for the SDK):

```bash
git clone <this repo> && cd healthchecks-pocket
scripts/setup.sh                # add --emulator to also create an Android emulator
npm run android:build           # debug APK: android/app/build/outputs/apk/debug/app-debug.apk
```

Already have Android Studio? Set `ANDROID_HOME` to its SDK first and setup uses it. If your default Java isn't 21,
setup finds a JDK 21 (or set `HCP_JAVA_HOME`). Gradle in this project can't run on newer JDKs yet.

| Command | What it does |
|---|---|
| `npm run dev` | Web version at http://localhost:5173 (use a phone-sized window) |
| `npm run lint` / `npm run build` | Lint the code and the shell scripts (ShellCheck); type-check (app and tests) and build the web bundle |
| `npm test` / `npm run test:e2e` | Unit, screen and script tests; browser tests (see Testing) |
| `npm run android:build` | Debug APK |
| `npm run android:emulator` | Start the emulator from `scripts/setup.sh --emulator` |
| `npm run android:run` | Build and launch on an emulator or device |
| `npm run android:phone` | Build, install and open on a USB-connected phone (enable USB debugging first) |
| `npm run android:release` | Signed release APK in `release/` (see below) |
| `npm run icons` | Re-render the PNG icons from `assets/icon.svg` |

The scripts are bash and run on macOS and Linux. On Windows, use WSL.

Newer Android SDK command-line tools (23+) route `sdkmanager` through Google's `android` CLI, which collects usage
metrics by default; `scripts/setup.sh` runs it with `--no-metrics`.

### Testing

The tests pin down behaviour, including exact wording, on purpose: when you change what the app does or says, update
the tests in the same change.

| Layer | Command | What it covers |
|---|---|---|
| Unit (`tests/unit`) | `npm test` | Formatting, time zones, the API client against a fake `fetch`, saved projects and their migration to secure storage, demo data, routes, and the build scripts (run with real bash) |
| Screens (`tests/ui`) | `npm test` | Every screen rendered against a fake healthchecks.io server that behaves like the real one: lists, check detail, status changes, ping log, pause/resume, tags, settings, setup, storage notices |
| Browser (`tests/e2e`) | `npm run test:e2e` | The production build in a phone-sized Chromium: main flows, plus rendering a fake DOM can't check (constant-width ticking times, centred spinner, no sideways scrolling, dark theme) |

`npx playwright install chromium` once before the browser tests. Tests run in a fixed time zone and locale, so they
pass the same everywhere. `npm run lint` also checks the shell scripts with ShellCheck: `scripts/shellcheck.sh` downloads a pinned release from the
ShellCheck project once (into the gitignored `.cache/`) and verifies its SHA-256 before running it.
CI runs all of these on every push and pull request, and a release isn't built unless they pass.

### Releasing

Releases are signed APKs attached to [GitHub releases](../../releases).

1. **Once:** run `scripts/make-keystore.sh`. It creates the signing key (default `~/.healthchecks-pocket/release.jks`)
   and writes its password to `android/keystore.properties`, which is gitignored. **Back both up.** Android only
   installs an update over an existing install if both are signed with the same key.
2. **Locally:** `npm run android:release` builds `release/healthchecks-pocket-<version>.apk` and its `.sha256`.
3. **From CI:** create an environment named `release` (Settings → Environments) that only allows `v*` tags and
   requires your approval, and add two secrets to it: `HCP_KEYSTORE_BASE64` (`base64 < release.jks`) and
   `HCP_KEYSTORE_PASSWORD`. Then `npm version <x.y.z> && git push --follow-tags`: `.github/workflows/release.yml`
   runs the tests, waits for you to approve the signing job (on the run's page in the Actions tab), then builds the
   APK and publishes the release.

The app's version comes from `package.json` (`1.2.3` becomes versionName `1.2.3`, versionCode `10203`). Keep minor
and patch at 99 or below, so each release gets a higher versionCode than the last.

## How it's built

```
src/core/       framework-free: API client, types, formatting, time zones, demo data, saved projects
src/platform/   the only platform-specific code: storage, secret storage, opening links
                  web.ts     browser (localStorage, window.open)
                  native.ts  Android/iOS via Capacitor (Preferences, Secure Storage, Browser)
src/ui/         React screens; hash routing (#/check/<id>), so the same build works from any host
android/        Capacitor Android project
assets/icon.svg the icon master (Android's adaptive icon is the same shapes as a vector drawable)
scripts/        setup, build/run/release, signing key, icon rendering
tests/          unit, screen (tests/ui) and browser (tests/e2e) tests
```

React + TypeScript + Vite, wrapped by [Capacitor](https://capacitorjs.com) for Android. Supporting iOS or desktop
(e.g. with Tauri) means adding an adapter in `src/platform/`; the rest is shared. The Healthchecks API allows browser
requests from any origin, so the app needs no backend.

## License

Healthchecks Pocket is free software under the [GNU Affero General Public License v3.0 or later](LICENSE)
(`AGPL-3.0-or-later`). You can use, modify and share it; if you distribute a modified version, or run one as a network
service, you must publish its source under the same license.

## Not affiliated

Healthchecks Pocket is an independent client. It isn't affiliated with or endorsed by Healthchecks.io.
