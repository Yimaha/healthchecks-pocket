// How far back a project's ping log reaches: a number of days, set per project.

/** Every number of days the ping log can reach back, in the order the slider offers them. */
export const PING_LOG_DAY_CHOICES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30] as const;

export type PingLogDays = (typeof PING_LOG_DAY_CHOICES)[number];

export const DEFAULT_PING_LOG_DAYS: PingLogDays = 7;

export function isPingLogDays(candidate: unknown): candidate is PingLogDays {
  return (PING_LOG_DAY_CHOICES as readonly unknown[]).includes(candidate);
}

/** "1 day", "7 days". */
export function pingLogDaysText(pingLogDays: PingLogDays): string {
  return pingLogDays === 1 ? '1 day' : `${pingLogDays} days`;
}

const DAY_MS = 86_400_000;

/** Where the ping log's range starts: exactly `pingLogDays` × 24 hours before now. */
export function pingLogRangeStart(pingLogDays: PingLogDays, now: Date): Date {
  return new Date(now.getTime() - pingLogDays * DAY_MS);
}
