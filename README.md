# Healthchecks Pocket

An unofficial Android app for [Healthchecks.io](https://healthchecks.io) and self-hosted
[Healthchecks](https://github.com/healthchecks/healthchecks).

## Features

- Checks at a glance, down and late first, with tag filters
- Check detail: status, schedule, 30-day status changes, ping log
- Ping bodies with `ERROR`/`WARN`/`INFO`/`DEBUG` lines highlighted
- Edit tags, pause and resume checks
- Several projects, self-hosted servers, time zones
- Demo mode: use the API key `demo`

## Install

Requires Android 7.0+. Either:

- **Download** the latest APK from [Releases](../../releases) and open it on your phone. To update, install a newer
  APK over it.
- **Build from source** (Node.js 22.12+, JDK 21, Android SDK; `scripts/setup.sh` offers to install what's missing):

  ```bash
  git clone https://github.com/Yimaha/healthchecks-pocket.git && cd healthchecks-pocket
  scripts/setup.sh
  npm run android:phone     # build, install and open on a USB-connected phone (USB debugging on)
  ```

Then create an API key in your project's **Settings → API Access**. Read-only keys show statuses only (no ping logs,
pausing or tag edits).

## Privacy

API keys stay on your phone, encrypted with an Android Keystore key, and are only sent to the server you entered. No
backend, analytics or tracking. App data is excluded from Android backups.

## Development

```bash
scripts/setup.sh --emulator   # also creates an emulator
npm run dev                   # web version for development, http://localhost:5173
npm run android:build         # debug APK
npm run android:run           # build and launch on an emulator or device
```

### Testing

| Command | Covers |
|---|---|
| `npm run build` | Type-check and build |
| `npm run lint` | Code (oxlint) and shell scripts (ShellCheck) |
| `npm test` | Unit and screen tests (Vitest) |
| `npm run test:e2e` | Production build in a phone-sized browser (Playwright; `npx playwright install chromium` once) |

Tests pin exact wording, so update them when you change what the app says. CI runs them on every push, and a release
isn't built unless they pass.

## Releasing

Releases are signed APKs built by `.github/workflows/release.yml`:

```bash
npm version patch         # or minor / major
git push --follow-tags
```

The tests run, then the signing job waits for approval (Actions tab → the run → **Review deployments**), then the APK
and its `.sha256` are published. The signing key lives in the `release` environment's secrets (`HCP_KEYSTORE_BASE64`,
`HCP_KEYSTORE_PASSWORD`). `scripts/make-keystore.sh` creates a key; `npm run android:release` signs locally. Keep
minor and patch at 99 or below (versionCode is `major*10000 + minor*100 + patch`).

## License

[AGPL-3.0-or-later](LICENSE). Not affiliated with or endorsed by Healthchecks.io.
