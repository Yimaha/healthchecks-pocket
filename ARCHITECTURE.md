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

Settings keep the names phones have saved them under, even where the code says something else: renaming one would
lose what's saved. `src/core/storage.ts` lists them all, and `tests/unit/names.test.ts` keeps the code to the names
most likely to drift back.
