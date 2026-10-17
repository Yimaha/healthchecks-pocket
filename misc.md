# Misc

## Releasing

Releases are signed APKs published to [GitHub Releases](../../releases) by `.github/workflows/release.yml`.

### Release a version

1. Add a `## X.Y.Z` section to `CHANGELOG.md`: a short summary of what changed since the previous version. It
   becomes the text of the GitHub release (check it with `scripts/release-notes.sh X.Y.Z`); a release without one
   fails before anything is built. Commit it.
2. Tag and push:

   ```bash
   npm version patch         # or minor / major; commits and tags vX.Y.Z
   git push --follow-tags
   ```

The tests run, then the signing job waits for approval (Actions tab → the run → **Review deployments**), then the APK
and its `.sha256` are published. If a release fails after its tag is pushed, release the next patch instead of
reusing the tag.

CI never lets the signing key share a job with project code. `build-unsigned` runs the whole npm + Gradle build but
has no key (`scripts/android.sh unsigned`) and produces an unsigned APK; `sign`, the only job in the `release`
environment, zipaligns and signs it with the Android SDK's `apksigner` (v2 + v3) and runs nothing else — so a
compromised build dependency has no key to steal — and fails the release if the v3 signature didn't take, so the key
can still be rotated later. The APK is checked before it's signed: that it isn't debuggable, and that its backup
rules (as merged into the manifest) back up only `CapacitorStorage.xml` and `CarriedApiKeys.xml`. A local
`scripts/android.sh release` signs with Gradle and runs the same checks, and `npm run android:verify-release` runs
all of them but the signature on an unsigned build, without a key and without putting anything in `release/`.
`tests/unit/backup-rules.test.ts` checks the same rules in the source on every push.

Keep minor and patch at 99 or below: versionCode is `major*10000 + minor*100 + patch`, and Android won't install
an update with a lower one.

### Signing key (once)

- `scripts/make-keystore.sh` creates the key (`~/.healthchecks-pocket/release.jks`) and writes its password to the
  gitignored `android/keystore.properties`. Back both up: updates only install if signed with the same key.
- `npm run android:release` signs locally into `release/`.
- For CI, the `release` environment (Settings → Environments: `v*` tags only, requires approval) holds two secrets:
  `HCP_KEYSTORE_BASE64` (`base64 < release.jks`) and `HCP_KEYSTORE_PASSWORD`.

## Tests on the emulator

`tests/android/` runs the real app (the debug build) on the Android emulator, driven through its WebView by
Playwright. healthchecks.io is faked as in the browser tests (`tests/fixtures/fake-api.ts`), so no account or network
is needed. They cover:

- **The core pages:** onboarding, the demo project, a check, a ping body, Android's Back button, and switching,
  adding and editing projects in Settings.
- **Where API keys are kept** (read from the app's `shared_prefs/` with `run-as`): encrypted by default; with *Keep
  API keys on this device only* off, only in `CarriedApiKeys.xml`; carried keys saved by 0.5.3 in the settings file
  move to their own file. No key ever shows up in logcat.

```bash
npm run android:emulator             # in another terminal
npm run test:emulator                # builds and installs the debug app, then runs them
npm run test:emulator -- security    # or only some (Playwright's arguments)
```

Each test clears the app's data, so they refuse to run on a real phone. CI runs them on `main`, and on a release tag
before the release is built (`.github/workflows/android-emulator.yml`).

## Demo screenshots and video

`docs/media/` holds 4 screenshots (check list, a check, a ping's log, Settings), a 16-second walkthrough as an
animated GIF (GitHub doesn't play video files, but plays a GIF inline) and a 14-second GIF of the "Heartbeat monitor"
background (at 20 fps, so the moving trace looks as smooth as it plays), all shown in [GALLERY.md](GALLERY.md); the
check list, the check and the walkthrough are also in the README. They're taken on the Android emulator with the
built-in demo project, so no real API keys, project names or servers appear. Each is cropped to the app, without
Android's status and navigation bars. To take them again (needs `ffmpeg`):

```bash
npm run android:emulator             # in another terminal
scripts/demo-media.sh                # builds and installs the debug app once, then makes every file
scripts/demo-media.sh ping-body      # or only some
```

Each file has its own script in `scripts/demo-media/` (e.g. `ping-body.mjs` makes `ping-body.png`), listing its
steps in order, and starts from a fresh app of its own: data cleared (only on the emulator; they refuse a real
phone), onboarding, the demo project. Nothing carries over from one file to the next, so changing one script can't
break another. `shared.mjs` there holds the tools they use. `docs/media/VERSION` records the `MAJOR.MINOR` they
were taken on. Keep the set small: every item is taken again when it goes stale.

## FAQ

[FAQ.md](FAQ.md) answers what users ask, and the README links to it. Keep it true:

- A PR that changes behaviour an answer describes updates `FAQ.md` in the same PR (it's on the PR checklist).
- Answers say what the app does, not how the code does it: no file names in `FAQ.md`.
- Only questions that have come up or that a screen raises. Add each to the contents list at the top.

## How it's built

React + TypeScript + Vite, wrapped by [Capacitor](https://capacitorjs.com) for Android. No backend: the Healthchecks
API accepts browser requests from any origin.

```
src/core/       API client, types, formatting, time zones, demo data, saved projects
src/platform/   the only platform-specific code (web.ts: browser, native.ts: Capacitor)
src/ui/         React screens, hash routing
android/        Capacitor Android project
scripts/        setup, build/run/release, signing key, icons
tests/          unit, screen (tests/ui), browser (tests/e2e) and emulator (tests/android) tests
```

## Third-party

- Preset check icons are from [Lucide](https://lucide.dev) (`lucide-react`): ISC licence, Copyright (c) 2026 Lucide
  Icons and Contributors; parts from Feather, MIT licence, Copyright (c) 2013-present Cole Bemis. The full text ships
  in the app as `public/third-party-licenses.txt`.
- Links in ping bodies are found with [linkify-it](https://github.com/markdown-it/linkify-it): MIT licence, Copyright
  (c) 2015 Vitaly Puzrin; with its Unicode data, [uc.micro](https://github.com/markdown-it/uc.micro): MIT licence,
  Copyright Mathias Bynens. Their full text is in `public/third-party-licenses.txt` too.
