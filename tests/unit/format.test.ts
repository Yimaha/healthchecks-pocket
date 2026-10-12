import { describe, expect, it } from 'vitest'
import {
  dateTime, duration, durationShort, lineLevel, relative, scheduleText, sortChecks, tagList,
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
