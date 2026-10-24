import { describe, expect, it } from 'vitest';
import { DEFAULT_PING_LOG_DAYS, isPingLogDays, PING_LOG_DAY_CHOICES, pingLogDaysText, pingLogRangeStart, type PingLogDays } from '@/core/projects/pingLogRange';

const rangeStartIso = (pingLogDays: PingLogDays, nowIso: string) => pingLogRangeStart(pingLogDays, new Date(nowIso)).toISOString();

describe('ping log range', () => {
  it('starts exactly N × 24 hours before now', () => {
    expect(rangeStartIso(7, '2026-10-20T15:00:00Z')).toBe('2026-10-13T15:00:00.000Z');
    expect(rangeStartIso(1, '2026-10-20T00:00:30Z')).toBe('2026-10-19T00:00:30.000Z');
  });

  it('reaches 30 days back across a month end', () => {
    expect(rangeStartIso(30, '2026-03-05T08:00:00Z')).toBe('2026-02-03T08:00:00.000Z');
  });
});

describe('ping log day choices', () => {
  it('are every whole number of days from 1 to 30, the default of 7 among them', () => {
    expect(PING_LOG_DAY_CHOICES).toEqual(Array.from({ length: 30 }, (_, dayIndex) => dayIndex + 1));
    expect(isPingLogDays(DEFAULT_PING_LOG_DAYS)).toBe(true);
  });

  it('don\'t include anything else', () => {
    expect([0, 31, 7.5, '7', null, undefined].map(isPingLogDays)).toEqual([false, false, false, false, false, false]);
  });
});

describe('ping log days as text', () => {
  it('says "day" for 1 and "days" otherwise', () => {
    expect([1, 2, 7, 30].map((pingLogDays) => pingLogDaysText(pingLogDays as PingLogDays))).toEqual(['1 day', '2 days', '7 days', '30 days']);
  });
});
