import { describe, expect, it } from 'vitest';
import { DEFAULT_PING_LOG_DAYS, MAX_PING_LOG_DAYS, MIN_PING_LOG_DAYS, pingLogRangeStart, savedPingLogDays } from '../../src/core/pingLogRange';

const rangeStartIso = (pingLogDays: number, nowIso: string) => pingLogRangeStart(pingLogDays, new Date(nowIso)).toISOString();

describe('ping log range', () => {
  it('starts exactly N × 24 hours before now', () => {
    expect(rangeStartIso(7, '2026-10-20T15:00:00Z')).toBe('2026-10-13T15:00:00.000Z');
    expect(rangeStartIso(1, '2026-10-20T00:00:30Z')).toBe('2026-10-19T00:00:30.000Z');
  });

  it('reaches 30 days back across a month end', () => {
    expect(rangeStartIso(30, '2026-03-05T08:00:00Z')).toBe('2026-02-03T08:00:00.000Z');
  });
});

describe('saved ping log days', () => {
  it('keeps a whole number of days within the range', () => {
    expect([MIN_PING_LOG_DAYS, DEFAULT_PING_LOG_DAYS, MAX_PING_LOG_DAYS].map(savedPingLogDays)).toEqual([1, 7, 30]);
  });

  it('brings a number outside the range back into it', () => {
    expect([0, -3, 31, 365].map(savedPingLogDays)).toEqual([1, 1, 30, 30]);
  });

  it('uses the default of 7 days when it is missing or not a whole number', () => {
    expect([undefined, null, '14', 7.5, Number.NaN, Number.POSITIVE_INFINITY].map(savedPingLogDays)).toEqual([7, 7, 7, 7, 7, 7]);
  });
});
