// Display helpers shared by every UI.

import { LinkifyIt } from 'linkify-it';
import type { Check, CheckStatus, Flip } from './types';

/** Down first, then things that need attention, then the rest. */
const STATUS_ORDER: Record<CheckStatus, number> = { down: 0, grace: 1, new: 2, up: 3, paused: 4 };

export function sortChecks(checks: Check[]): Check[] {
  return [...checks].sort(
    (first, second) => STATUS_ORDER[first.status] - STATUS_ORDER[second.status] || first.name.localeCompare(second.name),
  );
}

export const STATUS_LABEL: Record<CheckStatus, string> = {
  up: 'Up',
  down: 'Down',
  grace: 'Late',
  new: 'New',
  paused: 'Paused',
};

/** 65 -> "1m 05s", 7200 -> "2h 00m", 93600 -> "1d 02h". The two largest units,
 *  with the second zero-padded so a ticking label keeps its width (the UI
 *  also uses tabular digits). */
export function duration(seconds: number): string {
  const units: [string, number][] = [['d', 86400], ['h', 3600], ['m', 60], ['s', 1]];
  let rest = Math.max(0, Math.round(seconds));
  const first = units.findIndex(([, size]) => rest >= size);
  if (first === -1) return '0s';
  const [label, size] = units[first];
  const count = Math.floor(rest / size);
  rest -= count * size;
  const next = units[first + 1];
  if (!next) return `${count}${label}`;
  return `${count}${label} ${String(Math.floor(rest / next[1])).padStart(2, '0')}${next[0]}`;
}

/** For fixed values (schedules, run times): 3600 -> "1h", 5400 -> "1h 30m",
 *  3.2 -> "3s". No padding, and a zero second unit is dropped. */
export function durationShort(seconds: number): string {
  return duration(seconds).replace(/ 00[a-z]$/, '').replace(/ 0(\d)/, ' $1');
}

/** "3m 05s ago" / "in 57m 00s" relative to now (ticking; see duration). */
export function relative(iso: string | null, now = Date.now()): string {
  if (!iso) return 'never';
  const diff = (new Date(iso).getTime() - now) / 1000;
  if (Math.abs(diff) < 30) return 'just now';
  return diff < 0 ? `${duration(-diff)} ago` : `in ${duration(diff)}`;
}

/** Absolute time in the chosen zone, e.g. "Oct 11, 02:55:02 PM", or with
 *  `withZone` "Oct 11, 02:55:02 PM UTC". */
export function dateTime(iso: string, timeZone?: string, withZone = false): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone,
    timeZoneName: withZone ? 'short' : undefined,
  });
}

/** "Every 1h, 30m grace" or "0 * * * * (Europe/Berlin), 30m grace". */
export function scheduleText(check: Check): string {
  const grace = `${durationShort(check.grace)} grace`;
  if (check.schedule) return `${check.schedule}${check.tz ? ` (${check.tz})` : ''}, ${grace}`;
  return `Every ${durationShort(check.timeout)}, ${grace}`;
}

export function tagList(check: Check): string[] {
  return check.tags.split(' ').filter(Boolean);
}

/** Severity of one line of a ping body, for highlighting. Recognises the
 *  common levelled-log styles: "[ERROR] x", "ERROR: x", "level=error". */
export type LineLevel = 'error' | 'warn' | 'info' | 'debug' | 'plain';

/** The words logs write for a level (matched in any case), and the highlighting each one gets. */
const LINE_LEVEL_BY_WORD = new Map<string, LineLevel>([
  ['error', 'error'], ['err', 'error'], ['fail', 'error'], ['fatal', 'error'], ['crit', 'error'], ['critical', 'error'],
  ['warn', 'warn'], ['warning', 'warn'],
  ['info', 'info'], ['ok', 'info'],
  ['debug', 'debug'], ['trace', 'debug'],
]);

export function lineLevel(line: string): LineLevel {
  // A prefix decides when there is one, even a word that isn't a level ("Note: level=error" stays plain).
  const levelWord = levelPrefixWord(line) ?? levelFieldValue(line) ?? '';
  return LINE_LEVEL_BY_WORD.get(levelWord.toLowerCase()) ?? 'plain';
}

/** The word in a line's "[ERROR] x" or "ERROR: x" prefix, after any indent; undefined when the line has none. */
function levelPrefixWord(line: string): string | undefined {
  const prefixMatch = /^\s*(?:\[\s*(?<bracketedWord>[a-z]+)\s*\]|(?<wordBeforeColon>[a-z]+):)/i.exec(line);
  return prefixMatch?.groups?.bracketedWord ?? prefixMatch?.groups?.wordBeforeColon;
}

/** The value of the first "level=error" field anywhere in the line; undefined when the line has none. */
function levelFieldValue(line: string): string | undefined {
  // A search of its own: in one regex with the prefix, "^\s*.*level=" retried every split of an indent (100k tabs: 15 s).
  return /\blevel=(?<levelValue>[a-z]+)/i.exec(line)?.groups?.levelValue;
}

export interface Uptime {
  /** Share of the measured time spent up, 0-100. */
  percent: number;
  downSeconds: number;
  /** Start of the measured time when it's shorter than the window (ISO). */
  since: string | null;
}

/** Uptime over the last `days`, from the check's status changes. The API has
 *  no uptime figure, and its flips only say up or not up, so paused time
 *  counts as down, like healthchecks.io's own status changes. When the first
 *  change in the window is "went up", what came before is unknown (down,
 *  paused, or a check that didn't exist yet), so measuring starts there.
 *  null when there's nothing to measure (a new or paused check with no
 *  changes). */
export function uptime(flips: Flip[], status: CheckStatus, now: number, days = 30): Uptime | null {
  let start = now - days * 86400_000;
  const changes = flips
    .map((flip) => ({ time: Date.parse(flip.timestamp), up: !!flip.up }))
    .filter((change) => change.time >= start && change.time <= now)
    .sort((first, second) => first.time - second.time);
  let since: string | null = null;
  let up: boolean;
  if (!changes.length) {
    if (status === 'new' || status === 'paused') return null;
    up = status !== 'down';
  } else if (changes[0].up) {
    start = changes[0].time;
    since = new Date(start).toISOString();
    up = true;
  } else {
    up = true; // it went down, so it was up before
  }
  let down = 0;
  let from = start;
  for (const change of changes) {
    if (change.time <= from) { up = change.up; continue; }
    if (!up) down += change.time - from;
    from = change.time;
    up = change.up;
  }
  if (!up) down += now - from;
  const total = now - start;
  if (total <= 0) return null;
  return { percent: 100 * (1 - down / total), downSeconds: down / 1000, since };
}

/** "100%", "99.87%", "99.5%": rounded down, so any downtime shows below 100%. */
export function percentText(percent: number): string {
  return `${Math.max(0, Math.floor(percent * 100 + 1e-9) / 100)}%`;
}

/** Ping body text sizes (px): fine steps around the default, bigger ones up
 *  to 40. A− / A+ move one step; a pinch ends on the nearest. */
export const TEXT_SIZES = [8, 10, 12, 13, 14, 16, 18, 20, 24, 28, 32, 40];
export const DEFAULT_TEXT_SIZE = 13;

export function snapSize(px: number): number {
  return TEXT_SIZES.reduce((best, size) => (Math.abs(size - px) < Math.abs(best - px) ? size : best));
}

/** Text size while pinching: the starting size scaled by how far the
 *  fingers moved apart, within the smallest and largest step. */
export function pinchSize(startSize: number, startDistance: number, distance: number): number {
  const smallest = TEXT_SIZES[0];
  const largest = TEXT_SIZES[TEXT_SIZES.length - 1];
  if (startDistance <= 0) return startSize;
  return Math.min(largest, Math.max(smallest, (startSize * distance) / startDistance));
}

/** Text of a ping body line, shown exactly as it was sent. */
export interface LineText {
  kind: 'text';
  text: string;
}

/** An http(s) link in a ping body line, shown as its URL and opened in the browser. */
export interface LineLink {
  kind: 'link';
  url: string;
}

/** One part of a ping body line: see linkify. */
export type LinePart = LineText | LineLink;

/** Finds the http(s) links in a line, with linkify-it (markdown-it's link finder): no other schemes ("mailto:",
 *  "ftp:", "//") and no bare "example.com". It leaves out the punctuation of the sentence around a link, as in
 *  "see https://example.com/report.", but keeps the brackets a link opened, as in ".../wiki/Cron_(Unix)". */
const httpLinkFinder = new LinkifyIt({ fuzzyLink: false, fuzzyEmail: false })
  .add('mailto:', null)
  .add('ftp:', null)
  .add('//', null);

/** A line of a ping body as its text and http(s) links, in reading order, so the links can be shown as links.
 *  Joining the parts gives the line back unchanged, and there are no empty parts: "see https://example.com/a. Next"
 *  gives the text "see ", the link "https://example.com/a", and the text ". Next". */
export function linkify(line: string): LinePart[] {
  const linkMatches = httpLinkFinder.match(line) ?? [];
  const eachLinkWithTextBeforeIt = linkMatches.flatMap((linkMatch, linkIndex): LinePart[] => {
    const textStart = linkMatches[linkIndex - 1]?.lastIndex ?? 0; // where the previous link ended
    return [
      { kind: 'text', text: line.slice(textStart, linkMatch.index) },
      { kind: 'link', url: linkMatch.raw }, // as written; for http(s), linkify-it's url is the same text
    ];
  });
  const textAfterLastLink: LinePart = { kind: 'text', text: line.slice(linkMatches.at(-1)?.lastIndex ?? 0) };
  return [...eachLinkWithTextBeforeIt, textAfterLastLink].filter((part) => part.kind === 'link' || part.text !== '');
}
