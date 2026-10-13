import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, createApi, looksReadOnly, webLinks } from '../../src/core/api';
import { demoApi } from '../../src/core/demo';
import { check, flipsResponse, pingsResponse, readOnlyCheck, respond, UUID } from '../fixtures/healthchecks';

const account = { baseUrl: 'https://hc.example.org/', apiKey: 'test-key' };

function mockFetch(...responses: (Response | Error)[]) {
  const fetchMock = vi.fn<typeof fetch>();
  for (const response of responses) {
    if (response instanceof Error) fetchMock.mockRejectedValueOnce(response);
    else fetchMock.mockResolvedValueOnce(response);
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** The URL, method, headers and body of the n-th fetch call. */
function call(fetchMock: ReturnType<typeof mockFetch>, index = 0) {
  const [url, init] = fetchMock.mock.calls[index];
  return { url: String(url), method: init?.method ?? 'GET', headers: init?.headers as Record<string, string>, body: init?.body };
}

afterEach(() => vi.unstubAllGlobals());

describe('requests', () => {
  it('sends the API key header to the configured server (trailing slash trimmed)', async () => {
    const fetchMock = mockFetch(respond({ checks: [check] }));
    expect(await createApi(account).listChecks()).toEqual([check]);
    const request = call(fetchMock);
    expect(request.url).toBe('https://hc.example.org/api/v3/checks/');
    expect(request.headers['X-Api-Key']).toBe('test-key');
  });

  it('unwraps the ping log', async () => {
    const fetchMock = mockFetch(respond(pingsResponse));
    expect(await createApi(account).listPings(UUID)).toEqual(pingsResponse.pings);
    expect(call(fetchMock).url).toBe(`https://hc.example.org/api/v3/checks/${UUID}/pings/`);
  });

  it('pauses and resumes with POST', async () => {
    const fetchMock = mockFetch(respond({ ...check, status: 'paused' }), respond({ ...check, status: 'new', last_ping: null }));
    const api = createApi(account);
    expect((await api.pause(UUID)).status).toBe('paused');
    expect((await api.resume(UUID)).status).toBe('new');
    expect([call(fetchMock, 0), call(fetchMock, 1)].map((request) => `${request.method} ${request.url}`)).toEqual([
      `POST https://hc.example.org/api/v3/checks/${UUID}/pause`,
      `POST https://hc.example.org/api/v3/checks/${UUID}/resume`,
    ]);
  });

  it('sends tag edits as a text/plain JSON body (the API\'s CORS policy blocks application/json)', async () => {
    const fetchMock = mockFetch(respond({ ...check, tags: 'pi nas' }));
    await createApi(account).updateCheck(UUID, { tags: 'pi nas' });
    const request = call(fetchMock);
    expect(request.method).toBe('POST');
    expect(request.headers['Content-Type']).toBe('text/plain');
    expect(request.headers['X-Api-Key']).toBe('test-key');
    expect(JSON.parse(String(request.body))).toEqual({ tags: 'pi nas' });
  });
});

describe('status changes (flips)', () => {
  it('reads the wrapped {"flips": [...]} shape the server actually returns', async () => {
    mockFetch(respond(flipsResponse));
    expect(await createApi(account).listFlips(UUID)).toEqual(flipsResponse.flips);
  });

  it('also reads a bare array, as the docs describe', async () => {
    mockFetch(respond(flipsResponse.flips));
    expect(await createApi(account).listFlips(UUID)).toEqual(flipsResponse.flips);
  });

  it('asks for a time window when given one', async () => {
    const fetchMock = mockFetch(respond(flipsResponse));
    await createApi(account).listFlips(UUID, 2592000);
    expect(call(fetchMock).url).toBe(`https://hc.example.org/api/v3/checks/${UUID}/flips/?seconds=2592000`);
  });
});

describe('ping bodies', () => {
  it('returns the body text', async () => {
    mockFetch(respond('[ERROR] boom'));
    expect(await createApi(account).pingBody(UUID, 27)).toBe('[ERROR] boom');
  });

  it('returns null for a ping without a body (404)', async () => {
    mockFetch(respond('not found', { status: 404 }));
    expect(await createApi(account).pingBody(UUID, 1)).toBeNull();
  });
});

describe('errors', () => {
  it.each([
    [401, /API key rejected/],
    [403, /not allowed/],
    [429, /Too many requests/],
    [503, /temporarily unavailable/],
    [500, /HTTP 500/],
  ])('HTTP %s -> friendly message', async (status, message) => {
    mockFetch(respond({ error: 'x' }, { status }));
    const thrown = await createApi(account).listChecks().catch((error) => error);
    expect(thrown).toBeInstanceOf(ApiError);
    expect(thrown.status).toBe(status);
    expect(thrown.message).toMatch(message);
  });

  it('reports a network failure as unreachable (status 0)', async () => {
    mockFetch(new TypeError('Failed to fetch'));
    const thrown = await createApi(account).listChecks().catch((error) => error);
    expect(thrown).toMatchObject({ status: 0 });
    expect(thrown.message).toMatch(/Can't reach hc\.example\.org/);
  });
});

describe('demo key', () => {
  it('uses the built-in demo data and never touches the network', async () => {
    const fetchMock = mockFetch();
    const api = createApi({ baseUrl: 'https://healthchecks.io', apiKey: 'demo' });
    expect(api).toBe(demoApi);
    expect((await api.listChecks()).length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('looksReadOnly', () => {
  it('detects read-only keys by unique_key instead of uuid', () => {
    expect(looksReadOnly([readOnlyCheck])).toBe(true);
    expect(looksReadOnly([check])).toBe(false);
  });
  it('assumes a regular key when the project has no checks yet', () => expect(looksReadOnly([])).toBe(false));
});

describe('webLinks', () => {
  it('builds healthchecks.io links for anything the app sends you out for', () => {
    expect(webLinks.check('https://healthchecks.io/', UUID)).toBe(`https://healthchecks.io/checks/${UUID}/details/`);
    expect(webLinks.dashboard('https://hc.example.org')).toBe('https://hc.example.org/');
    expect(webLinks.account('https://healthchecks.io')).toBe('https://healthchecks.io/accounts/profile/');
  });
});
