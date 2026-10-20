<p align="center"><img src="public/icon-512.png" alt="Healthchecks Pocket icon" width="128"></p>

<h1 align="center">Healthchecks Pocket</h1>

An unofficial Android app for [Healthchecks.io](https://healthchecks.io) and self-hosted
[Healthchecks](https://github.com/healthchecks/healthchecks).

*Note: selfhosted variant is not yet thoroughly tested. might plan to remove support for V1 release since I don't have a use for it yet.*

## Features

- Checks at a glance, down and late first
- Ping logs with errors and warnings highlighted
- Several projects, including self-hosted servers

<p>
  <img src="docs/media/check-list.png" alt="The check list: each check with its icon and status, with a summary of how many are down, late and up" width="32%">
  <img src="docs/media/check-detail.png" alt="A check: its status, schedule, uptime, status changes and ping log" width="32%">
  <img src="docs/media/walkthrough.gif" alt="The app in use: the check list, then a check, then a failed run's ping log, and back" width="32%">
</p>

More screenshots in the [gallery](GALLERY.md).

## Install

Requires Android 7.0+ with an up-to-date WebView: version 111 or later, updated from Google Play (as Android System
WebView, or Chrome on Android 7 to 9). The app says so if yours is older. Either:

- **Download** the latest APK from [Releases](../../releases) and open it on your phone. To update, install a newer
  APK over it.
- **Build from source** (Node.js 24.21 or a later 24.x, JDK 21, Android SDK; `scripts/setup.sh` offers to install
  what's missing):

  ```bash
  git clone https://github.com/Yimaha/healthchecks-pocket.git && cd healthchecks-pocket
  scripts/setup.sh
  npm run android:phone     # build, install and open on a USB-connected phone (USB debugging on)
  ```

Then create an API key: open your project on [healthchecks.io/projects](https://healthchecks.io/projects/) (or your
own server), then **Settings → API Access**. Read-only keys show statuses only (no ping logs, pausing or tag edits).
Which one to create: [FAQ](FAQ.md#regular-or-read-only-key).

## Privacy

API keys stay on your phone, encrypted with an Android Keystore key, and go only to the server you entered. No
backend, analytics or tracking. More in the [FAQ](FAQ.md): your options for API keys, what moves to a new phone, and
the daily update check.

## Roadmap

- [iOS support](https://github.com/Yimaha/healthchecks-pocket/issues/3)

## Development

```bash
scripts/setup.sh --emulator   # also creates an emulator
npm run dev                   # web version for development, http://localhost:5173
npm run android:build         # debug APK
npm run android:run           # build and launch on an emulator or device
```

### Testing

Before you push, `npm run check` runs the checks your change needs, chosen by the files it touches, and a pre-push
hook refuses a push it hasn't passed. How to test a change: [TESTING.md](TESTING.md).

| Command | Covers |
|---|---|
| `npm run check` | The checks below that your change needs, then a summary (`-- --list`: which and why) |
| `npm run test:all` | All of them (`npm run check -- --all`), starting an emulator if none is running: before a release |
| `npm run build` | Type-check and build |
| `npm run lint` | Code (oxlint), semicolons everywhere (ESLint; `npx eslint --fix .` adds them), shell scripts (ShellCheck), GitHub workflows (actionlint) |
| `npm test` | Unit and screen tests (Vitest) |
| `npm run test:coverage` | The same, with line and branch coverage of `src/` (report in `coverage/index.html`); fails below 95.99% of lines |
| `npm run test:coverage-not-lower -- <commit>` | Fails if line coverage is below that commit's (CI: a PR's against `main`'s) |
| `npm run test:e2e` | Production build in a phone-sized browser (Playwright; `npx playwright install chromium` once) |
| `npm run test:emulator` | The debug app on the Android emulator (`npm run android:emulator` first): see [misc.md](misc.md#tests-on-the-emulator) |
| `npm run android:verify-release` | The release APK's checks on an unsigned release build (no signing key needed) |

Tests pin exact wording, so update them when you change what the app says. CI runs them on every push (the emulator
tests on `main` only), and a release isn't built unless they all pass. Releasing and architecture: [misc.md](misc.md).

## License

[AGPL-3.0-or-later](LICENSE). Not affiliated with or endorsed by Healthchecks.io.
