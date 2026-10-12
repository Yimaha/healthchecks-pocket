import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, createApi, looksReadOnly, webLinks } from '../../src/core/api'
import { demoApi } from '../../src/core/demo'
import { check, flipsResponse, pingsResponse, readOnlyCheck, respond, UUID } from '../fixtures/healthchecks'

const account = { baseUrl: 'https://hc.example.org/', apiKey: 'test-key' }

function mockFetch(...responses: (Response | Error)[]) {
  const fn = vi.fn<typeof fetch>()
  for (const r of responses) {
    if (r instanceof Error) fn.mockRejectedValueOnce(r)
    else fn.mockResolvedValueOnce(r)
  }
  vi.stubGlobal('fetch', fn)
  return fn
}

/** The URL, method, headers and body of the n-th fetch call. */
function call(fn: ReturnType<typeof mockFetch>, n = 0) {
  const [url, init] = fn.mock.calls[n]
  return { url: String(url), method: init?.method ?? 'GET', headers: init?.headers as Record<string, string>, body: init?.body }
}

afterEach(() => vi.unstubAllGlobals())

describe('requests', () => {
  it('sends the API key header to the configured server (trailing slash trimmed)', async () => {
    const fn = mockFetch(respond({ checks: [check] }))
    expect(await createApi(account).listChecks()).toEqual([check])
    const c = call(fn)
    expect(c.url).toBe('https://hc.example.org/api/v3/checks/')
    expect(c.headers['X-Api-Key']).toBe('test-key')
  })

  it('unwraps the ping log', async () => {
    const fn = mockFetch(respond(pingsResponse))
    expect(await createApi(account).listPings(UUID)).toEqual(pingsResponse.pings)
    expect(call(fn).url).toBe(`https://hc.example.org/api/v3/checks/${UUID}/pings/`)
  })

  it('pauses and resumes with POST', async () => {
    const fn = mockFetch(respond({ ...check, status: 'paused' }), respond({ ...check, status: 'new', last_ping: null }))
    const api = createApi(account)
    expect((await api.pause(UUID)).status).toBe('paused')
    expect((await api.resume(UUID)).status).toBe('new')
    expect([call(fn, 0), call(fn, 1)].map((c) => `${c.method} ${c.url}`)).toEqual([
      `POST https://hc.example.org/api/v3/checks/${UUID}/pause`,
      `POST https://hc.example.org/api/v3/checks/${UUID}/resume`,
    ])
  })

  it('sends tag edits as a text/plain JSON body (the API\'s CORS policy blocks application/json)', async () => {
    const fn = mockFetch(respond({ ...check, tags: 'pi nas' }))
    await createApi(account).updateCheck(UUID, { tags: 'pi nas' })
    const c = call(fn)
    expect(c.method).toBe('POST')
    expect(c.headers['Content-Type']).toBe('text/plain')
    expect(c.headers['X-Api-Key']).toBe('test-key')
    expect(JSON.parse(String(c.body))).toEqual({ tags: 'pi nas' })
  })
})

describe('status changes (flips)', () => {
  it('reads the wrapped {"flips": [...]} shape the server actually returns', async () => {
    mockFetch(respond(flipsResponse))
    expect(await createApi(account).listFlips(UUID)).toEqual(flipsResponse.flips)
  })

  it('also reads a bare array, as the docs describe', async () => {
    mockFetch(respond(flipsResponse.flips))
    expect(await createApi(account).listFlips(UUID)).toEqual(flipsResponse.flips)
  })

  it('asks for a time window when given one', async () => {
    const fn = mockFetch(respond(flipsResponse))
    await createApi(account).listFlips(UUID, 2592000)
    expect(call(fn).url).toBe(`https://hc.example.org/api/v3/checks/${UUID}/flips/?seconds=2592000`)
  })
})

describe('ping bodies', () => {
  it('returns the body text', async () => {
    mockFetch(respond('[ERROR] boom'))
    expect(await createApi(account).pingBody(UUID, 27)).toBe('[ERROR] boom')
  })

  it('returns null for a ping without a body (404)', async () => {
    mockFetch(respond('not found', { status: 404 }))
    expect(await createApi(account).pingBody(UUID, 1)).toBeNull()
  })
})

describe('errors', () => {
  it.each([
    [401, /API key rejected/],
    [403, /not allowed/],
    [429, /Too many requests/],
    [503, /temporarily unavailable/],
    [500, /HTTP 500/],
  ])('HTTP %s -> friendly message', async (status, message) => {
    mockFetch(respond({ error: 'x' }, { status }))
    const err = await createApi(account).listChecks().catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(status)
    expect(err.message).toMatch(message)
  })

  it('reports a network failure as unreachable (status 0)', async () => {
    mockFetch(new TypeError('Failed to fetch'))
    const err = await createApi(account).listChecks().catch((e) => e)
    expect(err).toMatchObject({ status: 0 })
    expect(err.message).toMatch(/Can't reach hc\.example\.org/)
  })
})

describe('demo key', () => {
  it('uses the built-in demo data and never touches the network', async () => {
    const fn = mockFetch()
    const api = createApi({ baseUrl: 'https://healthchecks.io', apiKey: 'demo' })
    expect(api).toBe(demoApi)
    expect((await api.listChecks()).length).toBeGreaterThan(0)
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('looksReadOnly', () => {
  it('detects read-only keys by unique_key instead of uuid', () => {
    expect(looksReadOnly([readOnlyCheck])).toBe(true)
    expect(looksReadOnly([check])).toBe(false)
  })
  it('assumes a regular key when the project has no checks yet', () => expect(looksReadOnly([])).toBe(false))
})

describe('webLinks', () => {
  it('builds healthchecks.io links for anything the app sends you out for', () => {
    expect(webLinks.check('https://healthchecks.io/', UUID)).toBe(`https://healthchecks.io/checks/${UUID}/details/`)
    expect(webLinks.dashboard('https://hc.example.org')).toBe('https://hc.example.org/')
    expect(webLinks.account('https://healthchecks.io')).toBe('https://healthchecks.io/accounts/profile/')
  })
})
