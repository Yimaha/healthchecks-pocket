// Healthchecks.io Management API v3 client. Plain fetch, no framework, so it
// runs unchanged in the browser, Capacitor and Tauri. The API sends
// `Access-Control-Allow-Origin: *`, so browsers can call it directly.

import { demoApi, DEMO_KEY } from './demo'
import type { Account, Check, Flip, Ping } from './types'

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Check fields the app can change. Tags are space-delimited, as in the API. */
export interface CheckUpdate {
  tags?: string
}

export interface HealthchecksApi {
  listChecks(): Promise<Check[]>
  getCheck(id: string): Promise<Check>
  listPings(uuid: string): Promise<Ping[]>
  pingBody(uuid: string, n: number): Promise<string | null>
  listFlips(id: string, seconds?: number): Promise<Flip[]>
  /** Change a check's settings; omitted fields stay as they are. */
  updateCheck(uuid: string, fields: CheckUpdate): Promise<Check>
  pause(uuid: string): Promise<Check>
  resume(uuid: string): Promise<Check>
}

const MESSAGES: Record<number, string> = {
  401: 'API key rejected. Check it in Settings.',
  403: 'This API key is not allowed to do that (read-only key?).',
  404: 'Not found.',
  429: 'Too many requests. Healthchecks.io allows about 100 per minute.',
  503: 'Healthchecks.io is temporarily unavailable.',
}

export function createApi(account: Pick<Account, 'baseUrl' | 'apiKey'>): HealthchecksApi {
  if (account.apiKey === DEMO_KEY) return demoApi

  const root = `${trimSlash(account.baseUrl)}/api/v3`

  async function request(path: string, init?: RequestInit): Promise<Response> {
    let res: Response
    try {
      res = await fetch(root + path, {
        ...init,
        headers: { 'X-Api-Key': account.apiKey, ...init?.headers },
      })
    } catch {
      throw new ApiError(0, `Can't reach ${new URL(root).host}. Check your connection.`)
    }
    if (!res.ok) throw new ApiError(res.status, MESSAGES[res.status] ?? `Request failed (HTTP ${res.status}).`)
    return res
  }

  const json = async <T>(path: string, init?: RequestInit) => (await request(path, init)).json() as Promise<T>
  const enc = encodeURIComponent

  return {
    listChecks: async () => (await json<{ checks: Check[] }>('/checks/')).checks,
    getCheck: (id) => json<Check>(`/checks/${enc(id)}`),
    listPings: async (uuid) => (await json<{ pings: Ping[] }>(`/checks/${enc(uuid)}/pings/`)).pings,
    async pingBody(uuid, n) {
      try {
        return await (await request(`/checks/${enc(uuid)}/pings/${n}/body`)).text()
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null // ping has no body
        throw e
      }
    },
    // The docs show a bare array, but healthchecks.io actually returns
    // {"flips": [...]} (seen 2026-10-11). Accept both.
    async listFlips(id, seconds) {
      const body = await json<Flip[] | { flips: Flip[] }>(`/checks/${enc(id)}/flips/${seconds ? `?seconds=${seconds}` : ''}`)
      return Array.isArray(body) ? body : body.flips ?? []
    },
    // text/plain keeps this a CORS "simple" request: the API's CORS policy
    // only allows the X-Api-Key header, so `Content-Type: application/json`
    // would be blocked in browsers and the app's WebView. Healthchecks parses
    // the body as JSON regardless of content type.
    updateCheck: (uuid, fields) => json<Check>(`/checks/${enc(uuid)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(fields),
    }),
    pause: (uuid) => json<Check>(`/checks/${enc(uuid)}/pause`, { method: 'POST' }),
    resume: (uuid) => json<Check>(`/checks/${enc(uuid)}/resume`, { method: 'POST' }),
  }
}

/** Read-only keys return `unique_key` instead of `uuid` on each check. */
export function looksReadOnly(checks: Check[]): boolean {
  return checks.length > 0 && checks.every((c) => !c.uuid && !!c.unique_key)
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

/** Links out to the healthchecks.io web UI for anything the app doesn't replicate. */
export const webLinks = {
  dashboard: (baseUrl: string) => `${trimSlash(baseUrl)}/`,
  check: (baseUrl: string, uuid: string) => `${trimSlash(baseUrl)}/checks/${uuid}/details/`,
  account: (baseUrl: string) => `${trimSlash(baseUrl)}/accounts/profile/`,
  apiKeysHelp: 'https://healthchecks.io/docs/api/',
}
