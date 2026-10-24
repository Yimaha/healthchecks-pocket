<!--
How to open an issue in this repo. GitHub fills a new issue with this file; replace each <placeholder> and delete
these comments before submitting.

Title: what's wrong or wanted, in plain words, led by the area. For example "Ping log: …" or "Startup: …".
Labels: one kind (bug, enhancement, documentation, accessibility or question) and one priority (high priority,
medium priority or low priority). See `gh label list` for what each means.

Keep every section short. Bullets with a bold lead-in when a section has several parts. Numbers over adjectives
("40 ms", "418 formatters"), and the app's own wording in quotes. Leave out the investigation story.
-->

**Priority:** <High | Medium | Low>. <One sentence: who is affected, and how much.>

## Problem
<!-- What happens now, and why it matters to someone using the app. -->

## Reproduced
<!-- Bugs only; delete this section for other issues. The build or commit, the steps, and what you saw. A table when
several inputs give different results. -->

## Where
<!-- The lines involved, linked at a commit so the links don't drift, each with a few words on what's there:
- [`src/core/api/client.ts#L37-L43`](https://github.com/Yimaha/healthchecks-pocket/blob/<commit>/src/core/api/client.ts#L37-L43): the messages, by status.
-->

## Proposed fix
<!-- The behaviour wanted, concretely enough to build and review against. Name any limit outside the app (the
Healthchecks API, Android, the browser) that shapes it. Questions still open get a bullet of their own. -->

## Delivery plan
<!-- Split the work into small PRs, each one a reviewer can read and understand in one sitting, rather than one big
PR. Each PR stands on its own: it builds, its tests pass, and the app still works if the next one never lands.
A one-PR issue says so. For example:
1. **Data:** the saved setting and the calculation, with unit tests. No UI.
2. **Setting:** the control in Settings, with a screen test.
3. **Screen:** the page that uses it, with screen and browser tests.
-->

## Delivery requirements
- **Several small PRs.** Follow the delivery plan above: one PR per step, not one PR for the whole issue. A PR that is hard to read is hard to own.
- **Specific names.** Name things for exactly what they hold or do, so a reader doesn't have to guess. For example `computeIconAssignmentKey` rather than `assignmentKey`, and `iconAssignmentKey` rather than `key`. Avoid generic names such as `key`, `list`, `data`, `next`, `value`, `item` or `used`.
- **A readable explanation next to the code.** Any step whose reason isn't obvious gets a short comment, written for a human, saying *why*. Keep it to one line where possible, not a wrapped multi-line block.
- **Tests.** Tests pin the new behaviour, and the full suite passes: `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e`.

_<Found in a code review of `<commit>` | Requested by the owner> (<YYYY-MM-DD>). The line links point at `<commit>` and may have moved since._
