# FAQ

Questions people ask about Healthchecks Pocket. Something missing? [Open an issue](../../../issues).

**API keys**

- [How is my API key protected?](#how-is-my-api-key-protected)
- [What are my options?](#what-are-my-options)
- [Where is my key sent?](#where-is-my-key-sent)
- [Regular or read-only key?](#regular-or-read-only-key)
- [Why does a project say "API key needed"?](#why-does-a-project-say-api-key-needed)

**Moving phones and data**

- [What moves to a new phone?](#what-moves-to-a-new-phone)
- [What do "Remove all projects" and "Reset the app" delete?](#what-do-remove-all-projects-and-reset-the-app-delete)
- [I upgraded from 0.2 or 0.3 and my projects are gone](#i-upgraded-from-02-or-03-and-my-projects-are-gone)

**Privacy**

- [Does the app send anything anywhere else?](#does-the-app-send-anything-anywhere-else)
- [Is the crash log safe to share?](#is-the-crash-log-safe-to-share)

**Using it**

- [Does it work with self-hosted Healthchecks?](#does-it-work-with-self-hosted-healthchecks)
- [How do I update?](#how-do-i-update)
- [Why doesn't the ping log go back further?](#why-doesnt-the-ping-log-go-back-further)

## API keys

### How is my API key protected?

It's encrypted on your phone with a key that lives in the Android Keystore. That key can't be exported, so a copy of
the app's data is useless on another device. The encrypted API key is also left out of Android backup and
phone-to-phone transfer. This is the default; see [What are my options?](#what-are-my-options) for the other one.

### What are my options?

One setting, *Keep API keys on this device only*, in [Settings](GALLERY.md#settings) → API keys (and on the
first-launch setup page):

- **On** (the default, recommended): keys are encrypted as above and stay on this phone. On a new phone your projects
  come along and you paste their keys again.
- **Off**: keys are saved unencrypted with your settings, so Android backup and phone-to-phone transfer carry them to
  a new phone. Anyone who can read your backup or the app's data could read them. What goes where:
  [What moves to a new phone?](#what-moves-to-a-new-phone)

### Where is my key sent?

Only to healthchecks.io, in the `X-Api-Key` header of each request. Nowhere else: if it redirects to another
address, the app stops there instead of following it with your key. The demo project's key isn't sent anywhere.

### Regular or read-only key?

Create keys in your project on healthchecks.io: **Settings → API Access**. The app tells which kind you pasted and
shows it in Settings.

- **Regular key:** everything the app does: statuses, ping logs, pausing and resuming, renaming checks and editing
  their tags.
- **Read-only key:** statuses only. No ping logs, pausing, renaming or tag edits.

Pick a regular key to use the whole app, or a read-only one if seeing statuses is all you want from this phone.

### Why does a project say "API key needed"?

Its key isn't on this phone. Usually you moved to a new phone with *Keep API keys on this device only* on, so the
project came along without its key. It also happens when a saved key can't be decrypted any more. Either way, paste
the key again: **Add API key** on the check list, or the project's Edit in Settings.

If it says **"API key couldn't be read"** instead, the key is still saved but the phone's secure storage didn't give
it back just now. Tap **Try again** on the check list; if that keeps failing, restart the phone or paste the key
again.

## Moving phones and data

### What moves to a new phone?

Android backup (to your Google account) and phone-to-phone transfer carry the app's settings:

- Theme, time zone and view options
- Project names and how many days their ping logs show
- Check icons, including images you uploaded (cropped and re-encoded, so their EXIF data, such as location, is gone)

API keys aren't included: paste them again on the new phone. With *Keep API keys on this device only* off, the keys
are saved unencrypted with the settings and carried over too:

- **Phone-to-phone transfer** copies them straight to the new phone.
- **Google backup** includes them only if your phone has a screen lock (PIN, pattern or password), which encrypts the
  backup on the phone. Without one they're left out, and on Android 12 and later so is the rest of the backup.
- **On Android 7 and 8**, backups can't be encrypted on the phone, so the keys go to Google in plain text.
- **Turning the option back on** removes the keys from this phone, but your last backup keeps them until Android makes
  the next one (usually within a day). If that matters, create new keys in your project's **Settings → API Access**
  and delete the old ones.

### What do "Remove all projects" and "Reset the app" delete?

Both are in [Settings](GALLERY.md#settings) → Risky actions, show what will happen and do nothing until you confirm.
Neither can be undone, and neither changes anything on healthchecks.io: your checks stay as they are.

- **Remove all projects** removes every project from this phone, with their API keys. Your settings stay
  (appearance, time zone, ping log view, API key protection and update checks).
- **Reset the app** deletes everything the app saved on this phone: every project and API key, and all settings go
  back to their defaults. The app starts again at the first-launch setup.

### I upgraded from 0.2/3/4/5/6/7... and my projects are gone
https://github.com/Yimaha/healthchecks-pocket/issues/119 tracks the feature for setting migration & version control, will be completed before official 1.0 release, but while in beta **you might need to re-setup Project between version update**, though the source of truth (healthcheck.io) is untouched


## Privacy

### Does the app send anything anywhere else?

Once a day it asks GitHub for the latest release. GitHub sees your IP address, and your Android version and phone
model (in the user agent), as any website would, but nothing about your checks. Turn it off in
[Settings](GALLERY.md#settings) → Updates. Apart from that and healthchecks.io, nothing: no backend, analytics or
tracking.

### Is the crash log safe to share?

It holds no API keys or project names. It names the screen, not its address. The error's own message is kept
as it is, though, and can include what the app was working on, so read it before posting.

## Using it

### Does it work with self-hosted Healthchecks?

No, only healthchecks.io. Versions up to 0.5.7 could also add a project on a self-hosted server. Newer versions leave
such a project out and delete its API key, so the key never goes to healthchecks.io. Its checks on your server stay
as they are.

### How do I update?

When there's a newer version, the app offers it with **Download** (it checks once a day, or with **Check now** in
[Settings](GALLERY.md#settings) → Updates). Or download the APK from [Releases](../../../releases) yourself. Install it over the old one: your projects and settings
stay. Android only installs an update signed with the same key as the installed app, which every release is.

### Why doesn't the ping log go back further?

Two limits:

- **The project's setting:** the ping log shows the last 7 days of pings by default. Change it, from 1 to 30 days,
  with the **Ping log** slider in the project's settings ([Settings](GALLERY.md#settings) → the project).
- **What healthchecks.io keeps:** healthchecks.io keeps only a check's latest pings and deletes older ones: 100 per
  check on the free plan, 1,000 on paid plans. The app can't show pings it no longer has. When that cuts the range
  short, the ping log says from when pings are missing.
