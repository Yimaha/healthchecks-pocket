// Shared setup for the browser tests: a fake healthchecks.io (via request
// interception), saved projects, a controlled clock, and a guard that fails
// any test which logs a console error.

import { test as base, expect, type Page } from '@playwright/test'
import type { Account, Check, Flip, Ping } from '../../src/core/types'
import { check, failBody, flipsResponse, NOW, pingsResponse, UUID } from '../fixtures/healthchecks'

export { expect, NOW, UUID }

export interface FakeProject {
  key: string
  checks: Check[]
  pings?: Record<string, Ping[]>
  flips?: Record<string, Flip[]>
  bodies?: Record<string, string>
}

export const defaultProject = (): FakeProject => ({
  key: 'key-home',
  checks: [structuredClone(check), { ...structuredClone(check), name: 'web', slug: 'web', uuid: 'uuid-web', tags: 'prod' }],
  pings: { [UUID]: pingsResponse.pings },
  flips: { [UUID]: flipsResponse.flips },
  bodies: { [`${UUID}/27`]: failBody },
})

export const homeAccount: Account = {
  id: 'p1', name: 'Home lab', baseUrl: 'https://healthchecks.io', apiKey: 'key-home', readOnly: false,
}

/**
 * Serve `projects` for every request to healthchecks.io's API. Mirrors the
 * real server where the app depends on it (wrapped flips, resume clears
 * last_ping, CORS headers). Returns the list of requests made.
 */
export async function fakeApi(page: Page, projects: FakeProject[], opts: { delayMs?: number } = {}) {
  const requests: string[] = []
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'X-Api-Key' }
  await page.route('https://healthchecks.io/api/v3/**', async (route) => {
    const req = route.request()
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' } })
    const url = new URL(req.url())
    const path = url.pathname.replace('/api/v3', '')
    requests.push(`${req.method()} ${path}${url.search}`)
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs))
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body, headers: cors })
    const project = projects.find((p) => p.key === req.headers()['x-api-key'])
    if (!project) return json({ error: 'wrong api key' }, 401)
    const find = (id: string) => project.checks.find((c) => c.uuid === id || c.unique_key === id)
    let m: RegExpMatchArray | null
    if (path === '/checks/') return json({ checks: project.checks })
    if ((m = path.match(/^\/checks\/([^/]+)$/))) {
      const c = find(m[1])
      if (!c) return json({ error: 'not found' }, 404)
      if (req.method() === 'POST') Object.assign(c, JSON.parse(req.postData() ?? '{}'))
      return json(c)
    }
    if ((m = path.match(/^\/checks\/([^/]+)\/pings\/$/))) return json({ pings: project.pings?.[m[1]] ?? [] })
    if ((m = path.match(/^\/checks\/([^/]+)\/pings\/(\d+)\/body$/))) {
      const body = project.bodies?.[`${m[1]}/${m[2]}`]
      return body === undefined ? json({ error: 'not found' }, 404) : route.fulfill({ body, contentType: 'text/plain', headers: cors })
    }
    if ((m = path.match(/^\/checks\/([^/]+)\/flips\/$/))) return json({ flips: project.flips?.[m[1]] ?? [] })
    if ((m = path.match(/^\/checks\/([^/]+)\/(pause|resume)$/))) {
      const c = find(m[1])!
      if (m[2] === 'pause') Object.assign(c, { status: 'paused' })
      else Object.assign(c, { status: 'new', last_ping: null, next_ping: null })
      return json(c)
    }
    return json({ error: 'unhandled' }, 500)
  })
  return requests
}

/** Open the app with these projects already saved on the device. */
export async function openApp(page: Page, opts: { accounts?: Account[]; hash?: string; storage?: Record<string, string> } = {}) {
  const accounts = opts.accounts ?? [homeAccount]
  await page.addInitScript(
    ({ accounts, storage }) => {
      // Only on the first load of the test; later reloads keep what the app saved.
      if (sessionStorage.getItem('e2e-seeded')) return
      sessionStorage.setItem('e2e-seeded', '1')
      localStorage.clear()
      localStorage.setItem('healthchecks-pocket.onboarded', '1') // tests about onboarding override it
      if (accounts.length) {
        // As the app saves them: names/servers as settings, keys as secrets.
        localStorage.setItem('healthchecks-pocket.projects', JSON.stringify(accounts.map(({ id, name, baseUrl, readOnly }) => ({ id, name, baseUrl, readOnly }))))
        for (const a of accounts) localStorage.setItem(`healthchecks-pocket.apiKey.${a.id}`, a.apiKey)
        localStorage.setItem('healthchecks-pocket.active', accounts[0].id)
      }
      for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v)
    },
    { accounts, storage: opts.storage ?? {} },
  )
  await page.goto(`/${opts.hash ?? '#/'}`)
}

/** Fails the test on any console error or uncaught exception in the page. */
export const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
      page.on('pageerror', (e) => errors.push(e.message))
      await use()
      expect(errors, 'console errors').toEqual([])
    },
    { auto: true },
  ],
})

/** Freeze the page clock at NOW (fixture time); advance it with page.clock. */
export const freezeClock = (page: Page) => page.clock.install({ time: NOW })
