# Changelog

What changed in each version. A version's section is the text of its GitHub release
(`scripts/release-notes.sh`), so add it before tagging.

## 0.5.4

- **Heartbeat monitor background:** a new Background option (Settings → Appearance, and first-launch setup): an ECG
  trace drawn the way a bedside monitor draws it, at a resting heart rate, in light and dark mode. It holds still for
  reduced motion and stops while the app is hidden.
- **Backups:** with "Keep API keys on this device only" off, the keys go to Google backup only when the backup is
  encrypted on the phone, which needs a screen lock. Android 7 and 8 can't encrypt a backup, so there they still go
  in plain text. On Android 12 and later, a phone without a screen lock no longer backs the app up to Google at all,
  whatever this setting. The README's Privacy section lists everything that goes to backup.
- **API key couldn't be read:** if the phone's secure storage fails to read a key at launch, the app says so and
  offers Try again, instead of asking for a key that's still saved.
- **Pasted API keys:** invisible characters a paste brings along are dropped, and a key with a character it can't
  have says so, instead of "Can't reach healthchecks.io".
- **Damaged saved projects:** if the saved project list is damaged, the app says so, with Reset, instead of opening
  with no projects and leaving their API keys behind.
- **Resuming a check that was already resumed** says "This check isn't paused any more" and shows its status now,
  instead of "Request failed (HTTP 409)".
- **Retry on a ping's page:** when the check itself couldn't be loaded, Retry now loads it again (it did nothing).
- **Big images:** an icon image over 10 MB is refused with a message, instead of possibly closing the app.
- **Project switcher:** the project's name is centered, and a long name no longer makes the switcher very wide.
- **Under the hood:** the "while loading" northern lights could keep running, unseen, after a load; they now always
  stop. Two status changes in the same second no longer confuse the list. New ids are random UUIDs.

## 0.5.3

- **No more endless "Getting … ready":** if your saved projects can't be loaded, the app says so, with Try again and
  Reset the app. A screen that crashes shows the same instead of a blank page; Try again goes back to the check list.
- **Crash log:** the error screens have a crash log to copy or share into a bug report (version, screen, the error). It
  holds no API keys, project names or servers. Settings → Risky actions → Debug shows the error screens on purpose.
- **Saving can't fail silently:** projects and API keys are saved one at a time, and if one can't be saved or removed,
  the app says so and keeps what's saved, instead of reporting success.
- **Ping bodies no longer freeze the app:** a long or bracket-heavy body could freeze it for minutes. The ping page
  shows the first 10,000 characters of a longer body (Copy and Share still give all of it), and only http(s) links
  are linked.
- **Breaking:** projects saved by 0.2 or 0.3 are no longer brought over. Add them again.

## 0.5.2

- **Check icons stay put when you switch projects:** switching projects from the check list could replace the icons
  you picked for the other project with defaults. It no longer does (icons already replaced need picking again).
- **Switching projects starts fresh:** the list no longer shows the previous project's checks while the new one loads
  or when it can't load, and a tag filter no longer carries over (it could leave the list empty).
- **Icons of deleted checks:** a check deleted on healthchecks.io keeps its saved icon, and no longer stops other
  checks from getting that icon by default.
- **"In use" dot on your uploaded icons:** it moved to the bottom right, where an upload's delete button no longer
  hides it.

## 0.5.1

- **Check icons, sturdier:** each uploaded image is now stored on its own (uploads from 0.5.0 move over by themselves
  on first launch), icon choices are saved only when they change, and cropping a big photo uses less memory.
- **Crop with the keyboard:** arrow keys move the square (Shift for bigger steps), + and - resize it.
- **Under the hood:** "check" everywhere, descriptive names and semicolons throughout, enforced by the linters.

## 0.5.0

- **Check icons:** every check gets an icon, chosen from its name where it can (a backup check gets the backup icon)
  and not repeated within a project. Change it from the check's page: pick one of 58 icons, or upload your own image
  (PNG, JPEG, WebP, GIF, BMP, AVIF, SVG or ICO) and drag a square over it to crop. Icons show in the check list, with
  the status dot on their corner.

## 0.4.1

- **New defaults:** dark theme and breathing northern lights. A theme or background you picked yourself is kept.

## 0.4.0

- **Onboarding:** a welcome on first launch, with a page to pick the theme, time zone, ping log text size and wrapping,
  and (on Android) key protection and update checks. Each shows its default and applies at once. Northern lights play
  behind it, and behind the startup screen, while things get ready.
- **Theme:** dark from 19:00 to 07:00 by default, or Light, Dark, or Follow system (Settings → Appearance).
- **Update check:** once a day, the app offers a newer release with Download, Skip this version or Later. It can be
  turned off, or run with Check now (Settings → Updates).
- **New phone:** Android backup and transfer now carry your settings and projects. API keys stay on the old phone
  unless you turn off *Keep API keys on this device only*; a project without its key asks for it.
- **Ping logs:** text from 8 to 40px, pinch to zoom, and clickable links. The Mono and Colours toggles are gone
  (logs are always monospace and highlighted).
- **Rename checks** from their page (saved to healthchecks.io).
- **Risky actions** (bottom of Settings): remove all projects, or reset the app to a first launch. Each shows what
  will happen and waits for you to confirm. With no projects left, the list points you to Settings.
- **Northern lights** background (Settings → Appearance → Background): always (the default), only while loading or
  refreshing, slowly breathing on and off, or none.

## 0.3.0

- **Ping logs:** Copy and Share buttons, plus text size, wrapping, font and colour options.
- **Check detail:** uptime over the last 30 days, with total downtime.
- **Fixed:** UTC showed as "UTC+0" on newer Android versions.

## 0.2.0

- First public release: checks at a glance, check detail with status changes and the ping log, ping bodies with log
  levels highlighted, tag editing, pause and resume, several projects (including self-hosted servers), time zones,
  and a demo mode.
