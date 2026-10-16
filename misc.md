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

Keep minor and patch at 99 or below: versionCode is `major*10000 + minor*100 + patch`, and Android won't install
an update with a lower one.

### Signing key (once)

- `scripts/make-keystore.sh` creates the key (`~/.healthchecks-pocket/release.jks`) and writes its password to the
  gitignored `android/keystore.properties`. Back both up: updates only install if signed with the same key.
- `npm run android:release` signs locally into `release/`.
- For CI, the `release` environment (Settings → Environments: `v*` tags only, requires approval) holds two secrets:
  `HCP_KEYSTORE_BASE64` (`base64 < release.jks`) and `HCP_KEYSTORE_PASSWORD`.

## How it's built

React + TypeScript + Vite, wrapped by [Capacitor](https://capacitorjs.com) for Android. No backend: the Healthchecks
API accepts browser requests from any origin.

```
src/core/       API client, types, formatting, time zones, demo data, saved projects
src/platform/   the only platform-specific code (web.ts: browser, native.ts: Capacitor)
src/ui/         React screens, hash routing
android/        Capacitor Android project
scripts/        setup, build/run/release, signing key, icons
tests/          unit, screen (tests/ui) and browser (tests/e2e) tests
```

## Third-party

- Preset check icons are from [Lucide](https://lucide.dev) (`lucide-react`): ISC licence, Copyright (c) 2026 Lucide
  Icons and Contributors; parts from Feather, MIT licence, Copyright (c) 2013-present Cole Bemis. The full text ships
  in the app as `public/third-party-licenses.txt`.
- Links in ping bodies are found with [linkify-it](https://github.com/markdown-it/linkify-it): MIT licence, Copyright
  (c) 2015 Vitaly Puzrin; with its Unicode data, [uc.micro](https://github.com/markdown-it/uc.micro): MIT licence,
  Copyright Mathias Bynens. Their full text is in `public/third-party-licenses.txt` too.
