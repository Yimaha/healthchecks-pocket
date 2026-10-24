# Architecture

## Glossary

One name for each thing, on the screens and in the code. Where healthchecks.io's API or a setting saved on phones
uses another name, the table gives both.

| Term | What it is | In the code |
|---|---|---|
| **Project** | A healthchecks.io project, which the app reaches with one API key. The app saves a list of them and shows one at a time. | `Project`; saved without its key as a `SavedProject`, in the `projects` setting |
| **Account** | The person's healthchecks.io login, which holds their projects. The app only links to its settings. | `webLinks.accountSettings` |
| **Active project** | The project whose checks the list shows, and which opens next time. | `activeProjectId` (the `active` setting) |
| **API key** | A project's key for healthchecks.io's API: a regular (read-write) key, or a read-only one, which can do much less ([below](#regular-and-read-only-api-keys)). | `apiKey`, in secure storage as `apiKey.<projectId>` |
| **Keep API keys on this device only** | Where API keys are saved: encrypted on this phone (on, the default), or carried. | `keepKeysOnDeviceOnly` (the `keys.deviceOnly` setting) |
| **Carried key** | An API key saved unencrypted with the settings, so it moves to a new phone. Only with *Keep API keys on this device only* off. | the `carriedKeys` setting |
| **Check id** | The id the app knows a check by: its regular key with a regular API key, its read-only key with a read-only one. Routes, icons and the API calls that take either use it. | `checkId`, from `checkIdOf(check)` |
| **Check's regular key** | The id only a regular API key gets for a check. It's in the check's ping URL, so whoever has it can ping the check. Listing pings, reading a ping's body, renaming, tags and pausing take it. | `checkRegularKey`, from healthchecks.io's `check.uuid` |
| **Check's read-only key** | What a read-only API key gets instead: a stable id for the check that doesn't give its regular key away. | `checkReadOnlyKey`, from healthchecks.io's `check.unique_key` |
| **Status change** | A check going up, or down or paused. The API calls it a flip. | `Flip`, `listFlips` |
| **Background** | What's behind every screen: northern lights, the heartbeat monitor, or none. | `BackgroundMode` (the `lights` setting) |
| **Icon assignment key** | Which check a saved icon is for: `<projectId>/<checkId>`. | `computeIconAssignmentKey` (the `icons.assigned` setting) |

Settings keep the names phones have saved them under, even where the code says something else: renaming one would
lose what's saved. `src/core/storage.ts` lists them all, and `tests/unit/names.test.ts` keeps the code to the names
most likely to drift back.

## Regular and read-only API keys

A read-only API key can only list a project's checks, read a check, list a check's status changes and list badges
([healthchecks.io's API docs](https://healthchecks.io/docs/api/)). Everything else takes a regular key: the ping log, a
ping's body, renaming a check, its tags, pausing and resuming. healthchecks.io refuses them with a read-only key,
whatever id the app sends: it's the key's permission that stops them, not the id.

The docs don't say why, only that a read-only key "omits sensitive information", and a ping log is that kind of
information: each ping records the IP address and user agent of whatever sent it, and its body is whatever the script
sent with it, stored as is. A read-only key doesn't get a check's regular key either: it's in the ping URL, so whoever
has it can ping the check, marking it up or down.

[FAQ.md](FAQ.md#regular-or-read-only-key) tells people using the app which key to create. What the screens show with a
read-only key is [#131](https://github.com/Yimaha/healthchecks-pocket/issues/131).
