# Misc

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

## Third-party

- Preset check icons are from [Lucide](https://lucide.dev) (`lucide-react`): ISC licence, Copyright (c) 2026 Lucide
  Icons and Contributors; parts from Feather, MIT licence, Copyright (c) 2013-present Cole Bemis. The full text ships
  in the app as `public/third-party-licenses.txt`. The icons beyond the hand-picked ones
  (`src/core/icons/catalog/iconCatalog.ts`), and the tags the icon search uses
  (`src/core/icons/catalog/lucideTags.ts`), are from Lucide 1.48.0's icon metadata (`icons/*.json` in
  [lucide-icons/lucide](https://github.com/lucide-icons/lucide)), under the same licence.
- Links in ping bodies are found with [linkify-it](https://github.com/markdown-it/linkify-it): MIT licence, Copyright
  (c) 2015 Vitaly Puzrin; with its Unicode data, [uc.micro](https://github.com/markdown-it/uc.micro): MIT licence,
  Copyright Mathias Bynens. Their full text is in `public/third-party-licenses.txt` too.
