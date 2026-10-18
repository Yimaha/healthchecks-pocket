// Display helpers shared by every UI.

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
