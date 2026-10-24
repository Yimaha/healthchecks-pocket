import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, createApi, looksReadOnly, webLinks } from '@/core/api/client';
import { demoApi } from '@/core/api/demo';
import { check, flipsResponse, pingsResponse, readOnlyCheck, respond, UUID } from '../fixtures/healthchecks';

const project = { apiKey: 'test-key' };

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
  it('sends the API key header to healthchecks.io, the only server', async () => {
    const fetchMock = mockFetch(respond({ checks: [check] }));
    expect(await createApi(project).listChecks()).toEqual([check]);
    const request = call(fetchMock);
    expect(request.url).toBe('https://healthchecks.io/api/v3/checks/');
    expect(request.headers['X-Api-Key']).toBe('test-key');
  });

  it('unwraps the ping log', async () => {
    const fetchMock = mockFetch(respond(pingsResponse));
    expect(await createApi(project).listPings(UUID)).toEqual(pingsResponse.pings);
    expect(call(fetchMock).url).toBe(`https://healthchecks.io/api/v3/checks/${UUID}/pings/`);
  });

  it('pauses and resumes with POST', async () => {
    const fetchMock = mockFetch(respond({ ...check, status: 'paused' }), respond({ ...check, status: 'new', last_ping: null }));
    const api = createApi(project);
    expect((await api.pause(UUID)).status).toBe('paused');
    expect((await api.resume(UUID)).status).toBe('new');
    expect([call(fetchMock, 0), call(fetchMock, 1)].map((request) => `${request.method} ${request.url}`)).toEqual([
      `POST https://healthchecks.io/api/v3/checks/${UUID}/pause`,
      `POST https://healthchecks.io/api/v3/checks/${UUID}/resume`,
    ]);
  });

  it('sends tag edits as a text/plain JSON body (the API\'s CORS policy blocks application/json)', async () => {
    const fetchMock = mockFetch(respond({ ...check, tags: 'pi nas' }));
    await createApi(project).updateCheck(UUID, { tags: 'pi nas' });
    const request = call(fetchMock);
    expect(request.method).toBe('POST');
    expect(request.headers['Content-Type']).toBe('text/plain');
    expect(request.headers['X-Api-Key']).toBe('test-key');
    expect(JSON.parse(String(request.body))).toEqual({ tags: 'pi nas' });
  });

  it('never follows a redirect, which would carry the API key to another server', async () => {
    const fetchMock = mockFetch(respond({ checks: [check] }));
    await createApi(project).listChecks();
    expect(fetchMock.mock.calls[0][1]?.redirect).toBe('manual');
  });
});

describe('status changes (flips)', () => {
  it('reads the wrapped {"flips": [...]} shape the server actually returns', async () => {
    mockFetch(respond(flipsResponse));
    expect(await createApi(project).listFlips(UUID)).toEqual(flipsResponse.flips);
  });

  it('also reads a bare array, as the docs describe', async () => {
    mockFetch(respond(flipsResponse.flips));
    expect(await createApi(project).listFlips(UUID)).toEqual(flipsResponse.flips);
  });

  it('asks for a time window when given one', async () => {
    const fetchMock = mockFetch(respond(flipsResponse));
    await createApi(project).listFlips(UUID, 2592000);
    expect(call(fetchMock).url).toBe(`https://healthchecks.io/api/v3/checks/${UUID}/flips/?seconds=2592000`);
  });
});

describe('ping bodies', () => {
  it('returns the body text', async () => {
    mockFetch(respond('[ERROR] boom'));
    expect(await createApi(project).pingBody(UUID, 27)).toBe('[ERROR] boom');
  });

  it('returns null for a ping without a body (404)', async () => {
    mockFetch(respond('not found', { status: 404 }));
    expect(await createApi(project).pingBody(UUID, 1)).toBeNull();
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
    const thrown = await createApi(project).listChecks().catch((error) => error);
    expect(thrown).toBeInstanceOf(ApiError);
    expect(thrown.status).toBe(status);
    expect(thrown.message).toMatch(message);
  });

  it('says a resume of a check that isn\'t paused (HTTP 409) found it already resumed', async () => {
    mockFetch(respond({ error: 'check is not paused' }, { status: 409 }));
    const thrown = await createApi(project).resume(UUID).catch((error) => error);
    expect(thrown).toBeInstanceOf(ApiError);
    expect(thrown).toMatchObject({ status: 409, message: "This check isn't paused any more." });
  });

  it('says the server redirected, rather than calling it unreachable', async () => {
    // What a browser hands back for a redirect it didn't follow: no status, no Location.
    const unfollowedRedirect = Object.defineProperties(new Response(null), { type: { value: 'opaqueredirect' }, status: { value: 0 }, ok: { value: false } });
    mockFetch(unfollowedRedirect);
    const thrown = await createApi(project).listChecks().catch((error) => error);
    expect(thrown).toBeInstanceOf(ApiError);
    expect(thrown.message).toBe("healthchecks.io redirects to another address, which the app doesn't follow.");
  });

  it('reports a network failure as unreachable (status 0)', async () => {
    mockFetch(new TypeError('Failed to fetch'));
    const thrown = await createApi(project).listChecks().catch((error) => error);
    expect(thrown).toMatchObject({ status: 0 });
    expect(thrown.message).toMatch(/Can't reach healthchecks\.io/);
  });

  it('gives up on a server that doesn\'t answer, and says so', async () => {
    const fetchMock = mockFetch();
    fetchMock.mockRejectedValueOnce(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
    const thrown = await createApi(project).listChecks().catch((error) => error);
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    expect(thrown).toMatchObject({ status: 0, message: "healthchecks.io didn't answer. Try again later." });
  });
});

describe('demo key', () => {
  it('uses the built-in demo data and never touches the network', async () => {
    const fetchMock = mockFetch();
    const api = createApi({ apiKey: 'demo' });
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
    expect(webLinks.check(UUID)).toBe(`https://healthchecks.io/checks/${UUID}/details/`);
    expect(webLinks.dashboard).toBe('https://healthchecks.io/');
    expect(webLinks.accountSettings).toBe('https://healthchecks.io/accounts/profile/');
  });
});
