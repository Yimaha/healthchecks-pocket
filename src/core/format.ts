// Display helpers shared by every UI.

import type { Check, CheckStatus } from './types'

/** Down first, then things that need attention, then the rest. */
const STATUS_ORDER: Record<CheckStatus, number> = { down: 0, grace: 1, new: 2, up: 3, paused: 4 }

export function sortChecks(checks: Check[]): Check[] {
  return [...checks].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name),
  )
}

export const STATUS_LABEL: Record<CheckStatus, string> = {
  up: 'Up',
  down: 'Down',
  grace: 'Late',
  new: 'New',
  paused: 'Paused',
}

/** 65 -> "1m 05s", 7200 -> "2h 00m", 93600 -> "1d 02h". The two largest units,
 *  with the second zero-padded so a ticking label keeps its width (the UI
 *  also uses tabular digits). */
export function duration(seconds: number): string {
  const units: [string, number][] = [['d', 86400], ['h', 3600], ['m', 60], ['s', 1]]
  let rest = Math.max(0, Math.round(seconds))
  const first = units.findIndex(([, size]) => rest >= size)
  if (first === -1) return '0s'
  const [label, size] = units[first]
  const n = Math.floor(rest / size)
  rest -= n * size
  const next = units[first + 1]
  if (!next) return `${n}${label}`
  return `${n}${label} ${String(Math.floor(rest / next[1])).padStart(2, '0')}${next[0]}`
}

/** For fixed values (schedules, run times): 3600 -> "1h", 5400 -> "1h 30m",
 *  3.2 -> "3s". No padding, and a zero second unit is dropped. */
export function durationShort(seconds: number): string {
  return duration(seconds).replace(/ 00[a-z]$/, '').replace(/ 0(\d)/, ' $1')
}

/** "3m 05s ago" / "in 57m 00s" relative to now (ticking; see duration). */
export function relative(iso: string | null, now = Date.now()): string {
  if (!iso) return 'never'
  const diff = (new Date(iso).getTime() - now) / 1000
  if (Math.abs(diff) < 30) return 'just now'
  return diff < 0 ? `${duration(-diff)} ago` : `in ${duration(diff)}`
}

/** Absolute time in the chosen zone, e.g. "Oct 11, 02:55:02 PM", or with
 *  `withZone` "Oct 11, 02:55:02 PM UTC". */
export function dateTime(iso: string, timeZone?: string, withZone = false): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone,
    timeZoneName: withZone ? 'short' : undefined,
  })
}

/** "Every 1h, 30m grace" or "0 * * * * (Europe/Berlin), 30m grace". */
export function scheduleText(check: Check): string {
  const grace = `${durationShort(check.grace)} grace`
  if (check.schedule) return `${check.schedule}${check.tz ? ` (${check.tz})` : ''}, ${grace}`
  return `Every ${durationShort(check.timeout)}, ${grace}`
}

export function tagList(check: Check): string[] {
  return check.tags.split(' ').filter(Boolean)
}

/** Severity of one line of a ping body, for highlighting. Recognises the
 *  common levelled-log styles: "[ERROR] x", "ERROR: x", "level=error". */
export type LineLevel = 'error' | 'warn' | 'info' | 'debug' | 'plain'

export function lineLevel(line: string): LineLevel {
  const m = /^\s*(?:\[\s*([a-z]+)\s*\]|([a-z]+):|.*\blevel=([a-z]+))/i.exec(line)
  const word = (m?.[1] ?? m?.[2] ?? m?.[3] ?? '').toLowerCase()
  if (['error', 'err', 'fail', 'fatal', 'crit', 'critical'].includes(word)) return 'error'
  if (['warn', 'warning'].includes(word)) return 'warn'
  if (['info', 'ok'].includes(word)) return 'info'
  if (['debug', 'trace'].includes(word)) return 'debug'
  return 'plain'
}
