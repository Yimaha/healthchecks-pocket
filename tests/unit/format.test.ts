import { describe, expect, it } from 'vitest';
import {
  dateTime, duration, durationShort, percentText, pinchSize, relative, scheduleText, snapSize, sortChecks, tagList, uptime,
} from '@/core/checks/format';
import { check, NOW } from '../fixtures/healthchecks';

describe('duration (ticking labels)', () => {
  it.each([
    [0, '0s'], [5, '5s'], [59, '59s'], [60, '1m 00s'], [65, '1m 05s'], [3599, '59m 59s'],
    [3600, '1h 00m'], [3660, '1h 01m'], [86399, '23h 59m'], [93600, '1d 02h'],
  ])('%s s -> %s', (seconds, out) => expect(duration(seconds)).toBe(out));

  it('zero-pads the second unit so a ticking label keeps its width', () => {
    const widths = [61, 69, 70, 125, 599].map((seconds) => duration(seconds).length);
    expect(new Set(widths).size).toBe(1);
  });

  it('treats negative input as zero', () => expect(duration(-5)).toBe('0s'));
});

describe('durationShort (fixed values)', () => {
  it.each([
    [3.2, '3s'], [60, '1m'], [1800, '30m'], [3600, '1h'], [5400, '1h 30m'], [3660, '1h 1m'], [86400, '1d'], [604800, '7d'],
  ])('%s s -> %s', (seconds, out) => expect(durationShort(seconds)).toBe(out));
});

describe('relative', () => {
  it('describes past and future times', () => {
    expect(relative(new Date(NOW - 125_000).toISOString(), NOW)).toBe('2m 05s ago');
    expect(relative(new Date(NOW + 3_600_000).toISOString(), NOW)).toBe('in 1h 00m');
  });
  it('says "just now" within 30 seconds', () => expect(relative(new Date(NOW - 10_000).toISOString(), NOW)).toBe('just now'));
  it('says "never" without a timestamp', () => expect(relative(null, NOW)).toBe('never'));
});

describe('dateTime', () => {
  const timestamp = '2026-10-11T19:55:02Z';
  it('formats in the requested time zone', () => {
    expect(dateTime(timestamp, 'UTC')).toContain('07:55:02');
    expect(dateTime(timestamp, 'Asia/Tokyo')).toContain('04:55:02');
  });
  it('can name the zone', () => expect(dateTime(timestamp, 'UTC', true)).toMatch(/UTC$/));
});

describe('scheduleText', () => {
  it('describes a simple period', () => expect(scheduleText(check)).toBe('Every 1h, 1h grace'));
  it('describes a cron schedule with its zone', () =>
    expect(scheduleText({ ...check, schedule: '0 3 * * *', tz: 'Europe/Berlin', grace: 1800 }))
      .toBe('0 3 * * * (Europe/Berlin), 30m grace'));
});

describe('sortChecks', () => {
  it('puts down, then late, then new, up and paused; alphabetical within a status', () => {
    const makeCheck = (name: string, status: typeof check.status) => ({ ...check, name, status });
    const sorted = sortChecks([makeCheck('b', 'up'), makeCheck('p', 'paused'), makeCheck('a', 'up'), makeCheck('n', 'new'), makeCheck('l', 'grace'), makeCheck('d', 'down')]);
    expect(sorted.map((check) => check.name)).toEqual(['d', 'l', 'n', 'a', 'b', 'p']);
  });
});

describe('tagList', () => {
  it('splits space-delimited tags and drops empties', () =>
    expect(tagList({ ...check, tags: ' home  nas ' })).toEqual(['home', 'nas']));
});

describe('uptime (last 30 days, from status changes)', () => {
  const HOUR = 3_600_000;
  const DAY = 24 * HOUR;
  const at = (msAgo: number, up: 0 | 1) => ({ timestamp: new Date(NOW - msAgo).toISOString(), up });

  it('is 100% with no changes while up (or in grace), 0% while down', () => {
    expect(uptime([], 'up', NOW)).toEqual({ percent: 100, downSeconds: 0, since: null });
    expect(uptime([], 'grace', NOW)?.percent).toBe(100);
    expect(uptime([], 'down', NOW)).toEqual({ percent: 0, downSeconds: 30 * 86400, since: null });
  });

  it('has nothing to measure for a new or paused check with no changes', () => {
    expect(uptime([], 'new', NOW)).toBeNull();
    expect(uptime([], 'paused', NOW)).toBeNull();
  });

  it('counts the time between going down and coming back up', () => {
    const result = uptime([at(5 * DAY, 0), at(5 * DAY - 3 * HOUR, 1)], 'up', NOW)!;
    expect(result.downSeconds).toBe(3 * 3600);
    expect(result.percent).toBeCloseTo(100 * (1 - 3 / (30 * 24)));
    expect(result.since).toBeNull();
  });

  it('counts a check that is still down up to now', () => {
    expect(uptime([at(2 * HOUR, 0)], 'down', NOW)!.downSeconds).toBe(2 * 3600);
  });

  it('measures from the first "went up" when what came before is unknown', () => {
    const result = uptime([at(3 * DAY, 1), at(2 * HOUR + 5 * 60_000, 0), at(2 * HOUR, 1)], 'up', NOW)!;
    expect(result.since).toBe(new Date(NOW - 3 * DAY).toISOString());
    expect(result.downSeconds).toBe(300);
    expect(result.percent).toBeCloseTo(100 * (1 - 300 / (3 * 86400)));
  });

  it('accepts changes in any order, ignores ones outside the window, and repeated states', () => {
    const flips = [at(1 * HOUR, 1), at(40 * DAY, 0), at(3 * HOUR, 0), at(2 * HOUR, 0)];
    expect(uptime(flips, 'up', NOW)!.downSeconds).toBe(2 * 3600);
  });
});

describe('percentText', () => {
  it.each([
    [100, '100%'], [99.876, '99.87%'], [99.5, '99.5%'], [99.99999, '99.99%'], [12.3, '12.3%'], [0, '0%'], [-1, '0%'],
  ])('%s -> %s', (percent, out) => expect(percentText(percent)).toBe(out));
});

describe('ping body text size', () => {
  it.each([[8, 8], [7, 8], [11, 10], [12.6, 13], [15, 14], [22, 20], [26, 24], [35, 32], [36, 32], [37, 40], [99, 40]])(
    'snapSize(%s) = %s (a tie goes to the smaller)', (px, out) => expect(snapSize(px)).toBe(out),
  );

  it('pinching scales the starting size by the finger distance, within 8-40', () => {
    expect(pinchSize(13, 100, 200)).toBe(26);
    expect(pinchSize(13, 100, 50)).toBe(8);
    expect(pinchSize(20, 100, 1000)).toBe(40);
    expect(pinchSize(13, 0, 50)).toBe(13);
  });
});
