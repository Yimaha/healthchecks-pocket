# Architecture

## Glossary

One name for each thing, on the screens and in the code. Where healthchecks.io's API or a setting saved on phones
uses another name, the table gives both.

| Term | What it is | In the code |
|---|---|---|
| **Project** | A healthchecks.io project, which the app reaches with one API key. The app saves a list of them and shows one at a time. | `Project`; saved without its key as a `SavedProject`, in the `projects` setting |
| **Account** | The person's healthchecks.io login, which holds their projects. The app only links to its settings. | `webLinks.accountSettings` |
| **Active project** | The project whose checks the list shows, and which opens next time. | `activeProjectId` (the `active` setting) |
| **API key** | A project's key for healthchecks.io's API: a regular (read-write) key, or a read-only one. | `apiKey`, in secure storage as `apiKey.<projectId>` |
| **Keep API keys on this device only** | Where API keys are saved: encrypted on this phone (on, the default), or carried. | `keepKeysOnDeviceOnly` (the `keys.deviceOnly` setting) |
| **Carried key** | An API key saved unencrypted with the settings, so it moves to a new phone. Only with *Keep API keys on this device only* off. | the `carriedKeys` setting |
| **Check id** | The id the app knows a check by: its uuid with a regular key, its unique key with a read-only one. Routes, icons and the API calls that take either use it. | `checkId`, from `checkIdOf(check)` |
| **Uuid** | A check's own id, also in its ping URL. Only a regular key gets it, and listing pings, pausing and editing a check need it. | `checkUuid`, from `check.uuid` |
| **Unique key** | What a read-only key gets instead of the uuid: a stable id for the check that doesn't give the uuid away. | `check.unique_key` |
| **Status change** | A check going up, or down or paused. The API calls it a flip. | `Flip`, `listFlips` |
| **Background** | What's behind every screen: northern lights, the heartbeat monitor, or none. | `BackgroundMode` (the `lights` setting) |
| **Icon assignment key** | Which check a saved icon is for: `<projectId>/<checkId>`. | `computeIconAssignmentKey` (the `icons.assigned` setting) |

Settings keep the names phones have saved them under, even where the code says something else: renaming one would
lose what's saved. `src/core/storage.ts` lists them all, and `tests/unit/names.test.ts` keeps the code to the names
most likely to drift back.
