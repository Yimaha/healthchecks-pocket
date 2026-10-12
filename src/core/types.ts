// Shapes of the Healthchecks.io Management API v3 responses we use.
// https://healthchecks.io/docs/api/

export type CheckStatus = 'new' | 'up' | 'grace' | 'down' | 'paused'

export interface Check {
  name: string
  slug: string
  tags: string // space-delimited
  desc: string
  grace: number // seconds
  timeout: number // expected period, seconds (ignored when `schedule` is set)
  schedule?: string // cron or OnCalendar expression
  tz?: string
  n_pings: number
  status: CheckStatus
  started: boolean // a /start ping arrived and the run hasn't finished
  last_ping: string | null
  next_ping: string | null
  manual_resume: boolean
  // Regular (read-write) keys only:
  uuid?: string
  ping_url?: string
  // Read-only keys only:
  unique_key?: string
}

export interface Ping {
  type: 'success' | 'start' | 'fail' | 'log' | 'ign' | string
  date: string
  n: number
  scheme: string
  remote_addr: string
  method: string
  ua: string
  rid?: string | null
  duration?: number // seconds, on a ping that completes a /start
  exitstatus?: number | null
}

export interface Flip {
  timestamp: string
  up: 0 | 1
}

/** One healthchecks.io project, reached with one API key. */
export interface Account {
  id: string
  name: string
  baseUrl: string // https://healthchecks.io, or a self-hosted instance
  apiKey: string // '' when the key isn't on this device (e.g. after moving phones)
  readOnly: boolean // read-only keys can't see ping logs or pause checks
}

/** Stable id for a check: uuid with a regular key, unique_key with a read-only one. */
export function checkId(check: Check): string {
  return check.uuid ?? check.unique_key ?? check.slug
}
