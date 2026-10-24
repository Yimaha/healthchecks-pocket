<!-- What changed and why. -->

**Tests** (`npm run check` runs the ones this change needs and lists what passed; see [TESTING.md](https://github.com/Yimaha/healthchecks-pocket/blob/main/documentation/TESTING.md))
- [ ] Build: `npm run build`
- [ ] Lint: `npm run lint`
- [ ] Unit and screen tests, at or above the line coverage floor: `npm run test:coverage`
- [ ] Browser tests, if the app changed: `npm run test:e2e`
- [ ] Emulator tests, if the app or the Android project changed: `npm run test:emulator`
- [ ] Release APK checks, if the Android project changed: `npm run android:verify-release`

**Checklist**
- [ ] `documentation/FAQ.md` still describes what the app does (updated here if this changes an answer)
