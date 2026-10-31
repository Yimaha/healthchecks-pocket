# Architecture

React + TypeScript + Vite, wrapped by [Capacitor](https://capacitorjs.com) for Android. No backend: the Healthchecks
API accepts browser requests from any origin.

## Folders

A folder per domain in `src/core`, a folder per page in `src/ui/pages`, and a file per thing, named for it: a
component, a hook, or one part of a domain's logic.

```
src/
  main.tsx          starts the app: the first theme, App, the service worker
  index.css         the styles
  app/              the shell: App (the shared state and the route switch), and the screens it shows instead of a
                    page: startup, the first project, no projects, a missing key, the error screen
  core/             the app's logic, without React
    app.ts          the app's name and version
    api/            healthchecks.io: the client, the shapes of its answers, links to its web UI, the demo project
    projects/       a project; saving projects and their keys; how far back the ping log reaches; versions/ is
                    each version of the saved project list, and how it's read
    storage/        settings and secrets on the device, and the queue their saves run in
    app-settings/   what the app saves about itself (all but the projects, their keys and the check icons); versions/
                    is each version, and how it's read
    checks/         sorting checks, status labels, uptime, durations
    ping-body/      a ping body's lines, levels, links and search, and its text size
    icons/          presets, a new check's icon, search, cropping; catalog/ holds data tables only
    preferences/    theme, time zones
    updates/        asking GitHub for a newer release
    diagnostics/    the crash log, simulated failures
  platform/         the only platform-specific code (web.ts: browser, native.ts: Capacitor)
  ui/
    routes.ts       the hash routes, and moving between them
    pages/          a folder per page, with the parts only that page uses
    components/     what several pages show; check-icon/ is a check's icon, with the Lucide glyphs
    hooks/          a hook per file
    state/          what every screen shares: a context each, with its use…State() hook
    background/     the northern lights and the heartbeat monitor
android/            the Capacitor Android project
scripts/            setup, build/run/release, the signing key, icons, the checks
tests/              unit (tests/unit), screen (tests/ui, in src/ui's folders), browser (tests/e2e) and emulator
                    (tests/android) tests
docs/               the Markdown apart from README.md, and the demo screenshots (docs/media)
```

## Which way imports go

`app` → `ui` → `core` → `platform`, never back:

- `core` never imports React, `ui` or `app`, so its logic runs, and is tested, without a screen.
- `platform` imports nothing else of the app's.
- `ui` never imports `app`. A page may show another page's parts: onboarding shows some of Settings', and the ping
  body's text size.

An import names a module in another folder by where it is in `src` (`@/core/api/client`), never by climbing out of
its own folder (`../`); a module beside or below it is `./`. `tests/unit/imports.test.ts` keeps imports to both rules.

## Where state lives

- **Saved on the device:** settings and secrets, through `core/storage` (`storage.ts` lists every setting). Projects
  and their API keys go through `core/projects`, which decides where each key is kept.
- **Shared by every screen:** `ui/state`. App makes each with its `use…State()` hook (theme, updates, check icons,
  projects, time zone, loading) and provides it; a screen reads it with `useTheme()`, `useProjects()` and the like.
  What's saved of it is read when the app starts, and each change is saved.
- **One screen's own:** `useState` in the page. A view choice kept on the device (a folded section, the text size)
  uses `useStoredFlag` or `useStoredNumber` (`ui/hooks/useStored.ts`).

## Glossary

One name for each thing, on the screens and in the code. Where healthchecks.io's API or a setting saved on phones
uses another name, the table gives both. A check has ids, never keys: a regular or read-only key is always a
project's API key.

| Term | What it is | In the code |
|---|---|---|
| **Project** | A healthchecks.io project, which the app reaches with one API key. The app saves a list of them and shows one at a time. | `Project`; saved without its key as a `SavedProject`, in the `projects.v2` setting (`core/projects/versions`) |
| **Account** | The person's healthchecks.io login, which holds their projects. The app only links to its settings. | `webLinks.accountSettings` |
| **Active project** | The project whose checks the list shows, and which opens next time. | `activeProjectId` (the `active` setting) |
| **API key** | A project's key for healthchecks.io's API: a regular (read-write) key, or a read-only one, which can do much less ([below](#regular-and-read-only-api-keys)). | `apiKey`, in secure storage as `apiKey.<projectId>` |
| **Keep API keys on this device only** | Where API keys are saved: encrypted on this phone (on, the default), or carried. | `keepKeysOnDeviceOnly` (the `keys.deviceOnly` setting) |
| **Carried key** | An API key saved unencrypted with the settings, so it moves to a new phone. Only with *Keep API keys on this device only* off. | the `carriedKeys` setting |
| **Check id** | The id the app knows a check by: its regular id with a regular API key, its read-only id with a read-only one. Routes, icons and the API calls that take either use it. | `checkId`, from `checkIdOf(check)` |
| **Check's regular id** | The id only a regular API key gets for a check. It's in the check's ping URL, so whoever has it can ping the check. Listing pings, reading a ping's body, renaming, tags and pausing take it. | `checkRegularId`, from healthchecks.io's `check.uuid`; a check that came with one is a `CheckWithRegularId` |
| **Check's read-only id** | What a read-only API key gets instead: a stable id for the check that doesn't give its regular id away. | `checkReadOnlyId`, from healthchecks.io's `check.unique_key`; a check that came with one is a `CheckWithReadOnlyId` |
| **Status change** | A check going up, or down or paused. The API calls it a flip. | `Flip`, `listFlips` |
| **Background** | What's behind every screen: northern lights, the heartbeat monitor, or none. | `BackgroundMode` (the `lights` setting) |
| **Icon assignment key** | Which check a saved icon is for: `<projectId>/<checkId>`. When a project's API key changes to the other kind in Settings, its icons move to the check ids the new key gets. | `computeIconAssignmentKey` (the `icons.assigned` setting) |

Settings keep the names phones have saved them under, even where the code says something else: renaming one would
lose what's saved. `src/core/storage/storage.ts` lists them all, and `tests/unit/names.test.ts` keeps the code to the
names most likely to drift back.

## Regular and read-only API keys

A read-only API key can only list a project's checks, read a check, list a check's status changes and list badges
([healthchecks.io's API docs](https://healthchecks.io/docs/api/)). Everything else takes a regular key: the ping log, a
ping's body, renaming a check, its tags, pausing and resuming. healthchecks.io refuses them with a read-only key,
whatever id the app sends: it's the key's permission that stops them, not the id. That's how the app tells a key's kind
when it's added or changed: once the key has listed the checks, which any key healthchecks.io knows may, it asks for
the project's integrations, which only a regular key may list (`isReadOnlyKey`). Kinds saved before were guessed from
the checks, so the check list corrects a saved kind that its checks contradict.

The docs don't say why, only that a read-only key "omits sensitive information", and a ping log is that kind of
information: each ping records the IP address and user agent of whatever sent it, and its body is whatever the script
sent with it, stored as is. A read-only key doesn't get a check's regular id either: it's in the ping URL, so whoever
has it can ping the check, marking it up or down.

A check's screen is two screens: `CheckDetail` loads the check, then shows `CheckDetailForRegularKey` or
`CheckDetailForReadOnlyKey`, by the kind of API key the check came to. The read-only one shows only what a read-only
key can read, and says nothing about the rest. It links to no ping, so a ping's page only opens without a regular key
from an old link: it says so instead (`WarningPage`).

[FAQ.md](FAQ.md#regular-or-read-only-key) tells people using the app which key to create. What the screens show with a
read-only key is [#131](https://github.com/Yimaha/healthchecks-pocket/issues/131).
