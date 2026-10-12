import { describe, expect, it } from 'vitest'
import {
  dateTime, duration, durationShort, lineLevel, percentText, relative, scheduleText, sortChecks, tagList, uptime,
} from '../../src/core/format'
import { check, NOW } from '../fixtures/healthchecks'

describe('duration (ticking labels)', () => {
  it.each([
    [0, '0s'], [5, '5s'], [59, '59s'], [60, '1m 00s'], [65, '1m 05s'], [3599, '59m 59s'],
    [3600, '1h 00m'], [3660, '1h 01m'], [86399, '23h 59m'], [93600, '1d 02h'],
  ])('%s s -> %s', (s, out) => expect(duration(s)).toBe(out))

  it('zero-pads the second unit so a ticking label keeps its width', () => {
    const widths = [61, 69, 70, 125, 599].map((s) => duration(s).length)
    expect(new Set(widths).size).toBe(1)
  })

  it('treats negative input as zero', () => expect(duration(-5)).toBe('0s'))
})

describe('durationShort (fixed values)', () => {
  it.each([
    [3.2, '3s'], [60, '1m'], [1800, '30m'], [3600, '1h'], [5400, '1h 30m'], [3660, '1h 1m'], [86400, '1d'], [604800, '7d'],
  ])('%s s -> %s', (s, out) => expect(durationShort(s)).toBe(out))
})

describe('relative', () => {
  it('describes past and future times', () => {
    expect(relative(new Date(NOW - 125_000).toISOString(), NOW)).toBe('2m 05s ago')
    expect(relative(new Date(NOW + 3_600_000).toISOString(), NOW)).toBe('in 1h 00m')
  })
  it('says "just now" within 30 seconds', () => expect(relative(new Date(NOW - 10_000).toISOString(), NOW)).toBe('just now'))
  it('says "never" without a timestamp', () => expect(relative(null, NOW)).toBe('never'))
})

describe('dateTime', () => {
  const t = '2026-10-11T19:55:02Z'
  it('formats in the requested time zone', () => {
    expect(dateTime(t, 'UTC')).toContain('07:55:02')
    expect(dateTime(t, 'Asia/Tokyo')).toContain('04:55:02')
  })
  it('can name the zone', () => expect(dateTime(t, 'UTC', true)).toMatch(/UTC$/))
})

describe('scheduleText', () => {
  it('describes a simple period', () => expect(scheduleText(check)).toBe('Every 1h, 1h grace'))
  it('describes a cron schedule with its zone', () =>
    expect(scheduleText({ ...check, schedule: '0 3 * * *', tz: 'Europe/Berlin', grace: 1800 }))
      .toBe('0 3 * * * (Europe/Berlin), 30m grace'))
})

describe('sortChecks', () => {
  it('puts down, then late, then new, up and paused; alphabetical within a status', () => {
    const mk = (name: string, status: typeof check.status) => ({ ...check, name, status })
    const sorted = sortChecks([mk('b', 'up'), mk('p', 'paused'), mk('a', 'up'), mk('n', 'new'), mk('l', 'grace'), mk('d', 'down')])
    expect(sorted.map((c) => c.name)).toEqual(['d', 'l', 'n', 'a', 'b', 'p'])
  })
})

describe('tagList', () => {
  it('splits space-delimited tags and drops empties', () =>
    expect(tagList({ ...check, tags: ' home  nas ' })).toEqual(['home', 'nas']))
})

describe('lineLevel (ping body highlighting)', () => {
  it.each([
    ['[ERROR] upload failed', 'error'], ['[FAIL] x', 'error'], ['ERROR: x', 'error'], ['fatal: x', 'error'],
    ['[WARN] disk', 'warn'], ['warning: x', 'warn'], ['level=warn disk almost full', 'warn'],
    ['[INFO] ok', 'info'], ['[ ok ] fine', 'info'], ['INFO: done', 'info'],
    ['[DEBUG] retry', 'debug'], ['trace: x', 'debug'],
    ['== nightly-backup (ran 7m ago)', 'plain'], ['', 'plain'],
  ])('%j -> %s', (line, level) => expect(lineLevel(line)).toBe(level))
})

describe('uptime (last 30 days, from status changes)', () => {
  const H = 3_600_000
  const DAY = 24 * H
  const at = (msAgo: number, up: 0 | 1) => ({ timestamp: new Date(NOW - msAgo).toISOString(), up })

  it('is 100% with no changes while up (or in grace), 0% while down', () => {
    expect(uptime([], 'up', NOW)).toEqual({ percent: 100, downSeconds: 0, since: null })
    expect(uptime([], 'grace', NOW)?.percent).toBe(100)
    expect(uptime([], 'down', NOW)).toEqual({ percent: 0, downSeconds: 30 * 86400, since: null })
  })

  it('has nothing to measure for a new or paused check with no changes', () => {
    expect(uptime([], 'new', NOW)).toBeNull()
    expect(uptime([], 'paused', NOW)).toBeNull()
  })

  it('counts the time between going down and coming back up', () => {
    const u = uptime([at(5 * DAY, 0), at(5 * DAY - 3 * H, 1)], 'up', NOW)!
    expect(u.downSeconds).toBe(3 * 3600)
    expect(u.percent).toBeCloseTo(100 * (1 - 3 / (30 * 24)))
    expect(u.since).toBeNull()
  })

  it('counts a check that is still down up to now', () => {
    expect(uptime([at(2 * H, 0)], 'down', NOW)!.downSeconds).toBe(2 * 3600)
  })

  it('measures from the first "went up" when what came before is unknown', () => {
    const u = uptime([at(3 * DAY, 1), at(2 * H + 5 * 60_000, 0), at(2 * H, 1)], 'up', NOW)!
    expect(u.since).toBe(new Date(NOW - 3 * DAY).toISOString())
    expect(u.downSeconds).toBe(300)
    expect(u.percent).toBeCloseTo(100 * (1 - 300 / (3 * 86400)))
  })

  it('accepts changes in any order, ignores ones outside the window, and repeated states', () => {
    const flips = [at(1 * H, 1), at(40 * DAY, 0), at(3 * H, 0), at(2 * H, 0)]
    expect(uptime(flips, 'up', NOW)!.downSeconds).toBe(2 * 3600)
  })
})

describe('percentText', () => {
  it.each([
    [100, '100%'], [99.876, '99.87%'], [99.5, '99.5%'], [99.99999, '99.99%'], [12.3, '12.3%'], [0, '0%'], [-1, '0%'],
  ])('%s -> %s', (p, out) => expect(percentText(p)).toBe(out))
})
