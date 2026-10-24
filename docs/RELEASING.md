# Releasing

Releases are signed APKs published to [GitHub Releases](../../../releases) by `.github/workflows/release.yml`.

## Release a version

1. Add a `## X.Y.Z` section to `CHANGELOG.md`: a short summary of what changed since the previous version, under
   `### Features`, `### Quality of life` and `### Bug fixes`, in that order (leave out an empty one). It becomes the
   text of the GitHub release (check it with `scripts/release-notes.sh X.Y.Z`); a release without one fails before
   anything is built. Commit it.
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
compromised build dependency has no key to steal — and fails the release if the v3 signature didn't take. The APK is
checked before it's signed: that it isn't debuggable, and that its backup
rules (as merged into the manifest) back up only `CapacitorStorage.xml` and `CarriedApiKeys.xml`. A local
`scripts/android.sh release` signs with Gradle and runs the same checks, and `npm run android:verify-release` runs
all of them but the signature on an unsigned build, without a key and without putting anything in `release/`.
`tests/unit/backup-rules.test.ts` checks the same rules in the source on every push.

Keep minor and patch at 99 or below: versionCode is `major*10000 + minor*100 + patch`, and Android won't install
an update with a lower one.

## Signing key (once)

- `scripts/make-keystore.sh` creates the key (`~/.healthchecks-pocket/release.jks`) and writes its password to the
  gitignored `android/keystore.properties`. Back both up: updates only install if signed with the same key.
- `npm run android:release` signs locally into `release/`.
- For CI, the `release` environment (Settings → Environments: `v*` tags only, requires approval) holds two secrets:
  `HCP_KEYSTORE_BASE64` (`base64 < release.jks`) and `HCP_KEYSTORE_PASSWORD`.
