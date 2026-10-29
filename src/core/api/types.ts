// Shapes of the Healthchecks.io Management API v3 responses we use.
// https://healthchecks.io/docs/api/

export type CheckStatus = 'new' | 'up' | 'grace' | 'down' | 'paused';

export interface Check {
  name: string;
  tags: string; // space-delimited
  desc: string;
  grace: number; // seconds
  timeout: number; // expected period, seconds (ignored when `schedule` is set)
  schedule?: string; // cron or OnCalendar expression
  tz?: string;
  n_pings: number;
  status: CheckStatus;
  started: boolean; // a /start ping arrived and the run hasn't finished
  last_ping: string | null;
  next_ping: string | null;
  manual_resume: boolean;
  // With a regular (read-write) API key only:
  uuid?: string; // the check's regular id (checkRegularId)
  ping_url?: string;
  // With a read-only API key only:
  unique_key?: string; // the check's read-only id (checkReadOnlyId)
}

export interface Ping {
  type: 'success' | 'start' | 'fail' | 'log' | 'ign' | string;
  date: string;
  n: number;
  scheme: string;
  remote_addr: string;
  method: string;
  ua: string;
  rid?: string | null;
  duration?: number; // seconds, on a ping that completes a /start
  exitstatus?: number | null;
}

/** A flip, which the screens call a status change: the check went up (1), or down or paused (0). */
export interface Flip {
  timestamp: string;
  up: 0 | 1;
}

/** A check's id: its regular id (uuid) with a regular API key, its read-only id (unique_key) with a read-only one. */
export function checkIdOf(check: Check): string {
  // healthchecks.io sends every check one of the two.
  return (check.uuid ?? check.unique_key)!;
}

/** A check as healthchecks.io sends it to a regular API key: with its regular id. */
export type CheckWithRegularId = Check & { uuid: string };

/** A check as healthchecks.io sends it to a read-only API key: with its read-only id, never its regular id. */
export type CheckWithReadOnlyId = Check & { uuid?: undefined; unique_key: string };

export function hasRegularId(check: Check): check is CheckWithRegularId {
  return !!check.uuid;
}

export function hasReadOnlyId(check: Check): check is CheckWithReadOnlyId {
  return !check.uuid && !!check.unique_key;
}
