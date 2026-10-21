// How far back a project's ping log reaches: a number of days, set per project.

export const MIN_PING_LOG_DAYS = 1;
export const MAX_PING_LOG_DAYS = 30;
export const DEFAULT_PING_LOG_DAYS = 7;

/** A saved project's ping log days, read back: the default when it's missing or damaged (projects saved before the
 *  setting existed have none), and a number outside the slider's range brought back into it. */
export function savedPingLogDays(savedValue: unknown): number {
  if (typeof savedValue !== 'number' || !Number.isInteger(savedValue)) return DEFAULT_PING_LOG_DAYS;
  return Math.min(MAX_PING_LOG_DAYS, Math.max(MIN_PING_LOG_DAYS, savedValue));
}

const DAY_MS = 86_400_000;

/** Where the ping log's range starts: exactly `pingLogDays` × 24 hours before now. */
export function pingLogRangeStart(pingLogDays: number, now: Date): Date {
  return new Date(now.getTime() - pingLogDays * DAY_MS);
}
