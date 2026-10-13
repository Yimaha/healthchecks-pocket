# Changelog

What changed in each version. A version's section is the text of its GitHub release
(`scripts/release-notes.sh`), so add it before tagging.

## 0.5.0

- **Job icons:** every check gets an icon, chosen from its name where it can (a backup check gets the backup icon) and
  not repeated within a project. Change it from the check's page: pick one of 58 icons, or upload your own image
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
