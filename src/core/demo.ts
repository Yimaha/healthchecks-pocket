// Built-in demo project, used when the API key is "demo". Lets people try the
// app (and lets us test every screen) without a real account. Timestamps are
// relative to when the app started, so it always looks live.

import type { HealthchecksApi } from './api'
import type { Check, Flip, Ping } from './types'

export const DEMO_KEY = 'demo'

const MIN = 60_000
// Anchored to app start (not each fetch) so the demo ages like real data.
const T0 = Date.now()
const ago = (ms: number) => new Date(T0 - ms).toISOString()
const ahead = (ms: number) => new Date(T0 + ms).toISOString()

const base = { slug: '', desc: '', n_pings: 0, started: false, manual_resume: false, schedule: undefined, tz: undefined }

function checks(): Check[] {
  return [
    {
      ...base, name: 'homeserver', slug: 'homeserver', uuid: 'demo-0001', tags: 'home server',
      desc: 'Hourly heartbeat. The ping body is a status report from every job on the server.',
      status: 'up', timeout: 3600, grace: 1800, n_pings: 412, last_ping: ago(7 * MIN), next_ping: ahead(53 * MIN),
    },
    {
      ...base, name: 'Nightly backup', slug: 'nightly-backup', uuid: 'demo-0002', tags: 'nas',
      status: 'down', timeout: 86400, grace: 3600, schedule: '0 3 * * *', tz: 'Europe/Berlin',
      n_pings: 61, last_ping: ago(31 * 60 * MIN), next_ping: null,
    },
    {
      ...base, name: 'Repo sync', slug: 'repo-sync', uuid: 'demo-0003', tags: 'server',
      status: 'grace', timeout: 900, grace: 600, n_pings: 2210, last_ping: ago(19 * MIN), next_ping: ago(4 * MIN),
    },
    {
      ...base, name: 'Website deploy', slug: 'website-deploy', uuid: 'demo-0004', tags: 'web',
      status: 'up', started: true, timeout: 120, grace: 300, n_pings: 9034, last_ping: ago(40_000), next_ping: ahead(80_000),
    },
    {
      ...base, name: 'Weekly reboot', slug: 'weekly-reboot', uuid: 'demo-0005', tags: 'server',
      status: 'paused', timeout: 604800, grace: 3600, n_pings: 12, last_ping: ago(3 * 1440 * MIN), next_ping: null,
    },
    {
      ...base, name: 'Disk canary', slug: 'disk-canary', uuid: 'demo-0006', tags: 'nas',
      status: 'new', timeout: 86400, grace: 3600, n_pings: 0, last_ping: null, next_ping: null,
    },
  ]
}

const REPORT_OK = `OK

== nightly-backup (ran 7m ago, every 24h, took 42s)
[INFO] 3 databases dumped, 1.2 GB uploaded
Logs: https://example.com/backups/nightly.log
== disk (ran 7m ago, every 15m, took 0s)
[INFO] / 41% used, /data 63% used
== certificates (ran 2h ago, every 6h, took 1s)
[INFO] example.com valid for 61 more days
-- homeserver`

const REPORT_WARN = `OK with 1 warnings
[WARN] certificates: example.com expires in 9 days

== certificates (ran 2m ago, every 6h, took 1s)
[WARN] certificates: example.com expires in 9 days
== disk (ran 2m ago, every 15m, took 0s)
[INFO] / 41% used, /data 63% used
-- homeserver`

const REPORT_FAIL = `FAIL (1 failing, 0 warnings)
[ERROR] nightly-backup: upload failed (connection timed out)

== nightly-backup (ran 4m ago, every 24h, took 30s)
[DEBUG] retrying upload (3/3)
[ERROR] nightly-backup: upload failed (connection timed out)
Logs: https://example.com/backups/nightly.log
-- homeserver`

function pings(uuid: string): Ping[] {
  const ua = 'curl/7.88.1'
  const mk = (n: number, msAgo: number, type: Ping['type'], extra: Partial<Ping> = {}): Ping =>
    ({ n, date: ago(msAgo), type, scheme: 'https', remote_addr: '203.0.113.7', method: 'POST', ua, ...extra })
  if (uuid === 'demo-0001') {
    return [
      mk(412, 7 * MIN, 'success'),
      mk(411, 67 * MIN, 'success'),
      mk(410, 127 * MIN, 'success'),
      mk(409, 187 * MIN, 'fail'),
      mk(408, 247 * MIN, 'success'),
    ]
  }
  if (uuid === 'demo-0004') {
    return [mk(9034, 40_000, 'start', { method: 'GET' }), mk(9033, 160_000, 'success', { duration: 3.2 })]
  }
  return [mk(1, 31 * 60 * MIN, 'success', { method: 'HEAD', ua: 'Wget/1.21' })]
}

function bodies(uuid: string, n: number): string | null {
  if (uuid !== 'demo-0001') return null
  return n === 409 ? REPORT_FAIL : n === 410 ? REPORT_WARN : REPORT_OK
}

function flips(): Flip[] {
  return [
    { timestamp: ago(187 * MIN), up: 0 },
    { timestamp: ago(127 * MIN), up: 1 },
    { timestamp: ago(3 * 1440 * MIN), up: 1 },
  ]
}

const wait = <T>(value: T) => new Promise<T>((r) => setTimeout(() => r(value), 250))

let paused = new Set<string>()
// Like healthchecks.io: resuming resets a check to New and clears last_ping.
const resumed = new Set<string>()
const tagEdits = new Map<string, string>()
const nameEdits = new Map<string, string>()

function withPauseState(c: Check): Check {
  const tags = tagEdits.get(c.uuid!) ?? c.tags
  c = { ...c, name: nameEdits.get(c.uuid!) ?? c.name }
  const lastPing = resumed.has(c.uuid!) ? null : c.last_ping
  if (paused.has(c.uuid!)) return { ...c, tags, status: 'paused', last_ping: lastPing, next_ping: null }
  if (resumed.has(c.uuid!)) return { ...c, tags, status: 'new', last_ping: null, next_ping: null }
  return { ...c, tags }
}

export const demoApi: HealthchecksApi = {
  listChecks: () => wait(checks().map(withPauseState)),
  getCheck: (id) => wait(withPauseState(checks().find((c) => c.uuid === id)!)),
  listPings: (uuid) => wait(pings(uuid)),
  pingBody: (uuid, n) => wait(bodies(uuid, n)),
  listFlips: () => wait(flips()),
  updateCheck(uuid, fields) {
    if (fields.tags !== undefined) tagEdits.set(uuid, fields.tags)
    if (fields.name !== undefined) nameEdits.set(uuid, fields.name)
    return this.getCheck(uuid)
  },
  pause(uuid) {
    paused = new Set(paused).add(uuid)
    return this.getCheck(uuid)
  },
  resume(uuid) {
    paused = new Set([...paused].filter((p) => p !== uuid))
    resumed.add(uuid)
    return this.getCheck(uuid)
  },
}
