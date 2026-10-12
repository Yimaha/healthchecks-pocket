// Shared helpers for screen tests: a fake healthchecks.io server behind
// `fetch`, and a way to start the app with saved projects.

import { render, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import type { Account, Check, Flip, Ping } from '../src/core/types'
import { App } from '../src/ui/App'

export interface FakeProject {
  key: string
  checks: Check[]
  pings?: Record<string, Ping[]> // by uuid
  flips?: Record<string, Flip[]> // by uuid or unique_key
  bodies?: Record<string, string> // `${uuid}/${n}`
}

export interface FakeRequest {
  method: string
  path: string
  key: string | null
  contentType: string | null
  body: unknown
}

/**
 * Stands in for healthchecks.io (or a self-hosted server at `base`). Behaves
 * like the real API where the app depends on it: flips come wrapped in
 * {"flips": [...]}, resume resets a check to New and clears last_ping, resume
 * of a check that isn't paused is a 409, unknown keys get a 401.
 */
export function fakeServer(projects: FakeProject[], base = 'https://healthchecks.io') {
  const requests: FakeRequest[] = []
  const failures: { match: RegExp; status: number; times: number }[] = []
  const projectFor = (key: string | null) => projects.find((p) => p.key === key)

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  const handler = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    const headers = (init?.headers ?? {}) as Record<string, string>
    const key = headers['X-Api-Key'] ?? null
    const raw = init?.body ? String(init.body) : null
    const req: FakeRequest = {
      method,
      path: url.pathname + url.search,
      key,
      contentType: headers['Content-Type'] ?? null,
      body: raw ? JSON.parse(raw) : null,
    }
    requests.push(req)

    if (`${url.protocol}//${url.host}` !== new URL(base).origin) throw new TypeError('Failed to fetch')
    const failure = failures.find((f) => f.times > 0 && f.match.test(`${method} ${req.path}`))
    if (failure) {
      failure.times--
      return json({ error: 'injected' }, failure.status)
    }
    const project = projectFor(key)
    if (!project) return json({ error: 'wrong api key' }, 401)

    const path = url.pathname.replace(/^\/api\/v3/, '')
    const find = (id: string) => project.checks.find((c) => c.uuid === id || c.unique_key === id)
    let m: RegExpMatchArray | null

    if (method === 'GET' && path === '/checks/') return json({ checks: project.checks })
    if ((m = path.match(/^\/checks\/([^/]+)$/))) {
      const c = find(decodeURIComponent(m[1]))
      if (!c) return json({ error: 'not found' }, 404)
      if (method === 'POST') {
        Object.assign(c, req.body)
        return json(c)
      }
      return json(c)
    }
    if ((m = path.match(/^\/checks\/([^/]+)\/pings\/$/))) return json({ pings: project.pings?.[m[1]] ?? [] })
    if ((m = path.match(/^\/checks\/([^/]+)\/pings\/(\d+)\/body$/))) {
      const body = project.bodies?.[`${m[1]}/${m[2]}`]
      return body === undefined ? json({ error: 'not found' }, 404) : new Response(body, { headers: { 'Content-Type': 'text/plain' } })
    }
    if ((m = path.match(/^\/checks\/([^/]+)\/flips\/$/))) return json({ flips: project.flips?.[m[1]] ?? [] })
    if (method === 'POST' && (m = path.match(/^\/checks\/([^/]+)\/(pause|resume)$/))) {
      const c = find(m[1])
      if (!c) return json({ error: 'not found' }, 404)
      if (m[2] === 'pause') Object.assign(c, { status: 'paused' })
      else if (c.status !== 'paused') return new Response('check is not paused', { status: 409 })
      else Object.assign(c, { status: 'new', last_ping: null, next_ping: null })
      return json(c)
    }
    return json({ error: `unhandled ${method} ${url.pathname}` }, 500)
  })

  vi.stubGlobal('fetch', handler)
  return {
    requests,
    /** Requests other than the read-only GETs, e.g. ["POST /api/v3/checks/<id>/pause"]. */
    writes: () => requests.filter((r) => r.method !== 'GET').map((r) => `${r.method} ${r.path}`),
    count: (re: RegExp) => requests.filter((r) => re.test(`${r.method} ${r.path}`)).length,
    /** Make the next `times` matching requests fail with `status`. */
    fail(match: RegExp, status: number, times = 1) {
      failures.push({ match, status, times })
    },
  }
}

export function account(overrides: Partial<Account> = {}): Account {
  return { id: 'p1', name: 'Home lab', baseUrl: 'https://healthchecks.io', apiKey: 'key-home', readOnly: false, ...overrides }
}

/** Save projects the way the app does: names and servers as settings, each
 *  API key as its own secret (on the web, both are localStorage). */
export function saveProjects(accounts: Account[]) {
  localStorage.setItem('healthchecks-pocket.projects', JSON.stringify(accounts.map(({ apiKey: _, ...p }) => p)))
  for (const a of accounts) if (a.apiKey) localStorage.setItem(`healthchecks-pocket.apiKey.${a.id}`, a.apiKey)
}

/** The projects saved on the device, keys joined back in ('' when missing). */
export function savedProjects(): Account[] {
  const projects: Omit<Account, 'apiKey'>[] = JSON.parse(localStorage.getItem('healthchecks-pocket.projects') ?? '[]')
  return projects.map((p) => ({ ...p, apiKey: localStorage.getItem(`healthchecks-pocket.apiKey.${p.id}`) ?? '' }))
}

/** Start the app as if these projects were saved on the device. */
export function startApp(opts: { accounts?: Account[]; active?: string; hash?: string } = {}): RenderResult & { user: ReturnType<typeof userEvent.setup> } {
  const accounts = opts.accounts ?? [account()]
  if (accounts.length) {
    saveProjects(accounts)
    localStorage.setItem('healthchecks-pocket.active', opts.active ?? accounts[0].id)
  }
  window.location.hash = opts.hash ?? '#/'
  // userEvent waits between actions; with fake timers it must advance them.
  const user = userEvent.setup({ advanceTimers: (ms) => { if (vi.isFakeTimers()) vi.advanceTimersByTime(ms) } })
  return { ...render(<App />), user }
}

/** Accept (true) or cancel (false) the next confirm() dialogs, recording their text. */
export function answerConfirms(...answers: boolean[]) {
  const asked: string[] = []
  vi.spyOn(window, 'confirm').mockImplementation((message?: string) => {
    asked.push(String(message))
    return answers.length ? answers.shift()! : true
  })
  return asked
}

/** Text as a person reads it: separate elements separated by a space (so
 *  "Up" + "running now" isn't "Uprunning now"), runs of text kept intact
 *  ("#" + "25" stays "#25"), whitespace collapsed. */
export function text(el: Element | null | undefined): string {
  const words = (node: Node): string =>
    node.nodeType === Node.TEXT_NODE ? node.textContent ?? '' : [...node.childNodes].map((c) => (c.nodeType === Node.ELEMENT_NODE ? ` ${words(c)} ` : words(c))).join('')
  return el ? words(el).replace(/\s+/g, ' ').trim() : ''
}
