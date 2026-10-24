// Shapes of the Healthchecks.io Management API v3 responses we use.
// https://healthchecks.io/docs/api/

import type { PingLogDays } from '@/core/projects/pingLogRange';

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
  uuid?: string; // the check's regular key (checkRegularKey)
  ping_url?: string;
  // With a read-only API key only:
  unique_key?: string; // the check's read-only key (checkReadOnlyKey)
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

/** One healthchecks.io project, reached with one API key. */
export interface Project {
  id: string;
  name: string;
  apiKey: string; // '' when the key isn't on this device (e.g. after moving phones), or couldn't be read
  apiKeyUnreadable?: true; // the key is saved, but secure storage failed to read it at launch
  readOnly: boolean; // read-only keys can't see ping logs or pause checks
  pingLogDays: PingLogDays; // how many days back the ping log reaches
}

/** A project as the `projects` setting holds it: without its API key, which is saved apart. */
export type SavedProject = Pick<Project, 'id' | 'name' | 'readOnly' | 'pingLogDays'>;

/** A check's id: its regular key (uuid) with a regular API key, its read-only key (unique_key) with a read-only one. */
export function checkIdOf(check: Check): string {
  // healthchecks.io sends every check one of the two.
  return (check.uuid ?? check.unique_key)!;
}
