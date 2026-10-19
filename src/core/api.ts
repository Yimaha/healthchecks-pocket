// Healthchecks.io Management API v3 client. Plain fetch, no framework, so it
// runs unchanged in the browser, Capacitor and Tauri. The API sends
// `Access-Control-Allow-Origin: *`, so browsers can call it directly.

import { demoApi, DEMO_KEY } from './demo';
import type { Account, Check, Flip, Ping } from './types';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Check fields the app can change. Tags are space-delimited, as in the API. */
export interface CheckUpdate {
  name?: string;
  tags?: string;
}

export interface HealthchecksApi {
  listChecks(): Promise<Check[]>;
  getCheck(id: string): Promise<Check>;
  listPings(uuid: string): Promise<Ping[]>;
  pingBody(uuid: string, pingNumber: number): Promise<string | null>;
  listFlips(id: string, seconds?: number): Promise<Flip[]>;
  /** Change a check's settings; omitted fields stay as they are. */
  updateCheck(uuid: string, fields: CheckUpdate): Promise<Check>;
  pause(uuid: string): Promise<Check>;
  resume(uuid: string): Promise<Check>;
}

export const REQUEST_TIMEOUT_MS = 15_000;

const MESSAGES: Record<number, string> = {
  401: 'API key rejected. Check it in Settings.',
  403: 'This API key is not allowed to do that (read-only key?).',
  404: 'Not found.',
  429: 'Too many requests. Healthchecks.io allows about 100 per minute.',
  503: 'Healthchecks.io is temporarily unavailable.',
};

export function createApi(account: Pick<Account, 'baseUrl' | 'apiKey'>): HealthchecksApi {
  if (account.apiKey === DEMO_KEY) return demoApi;

  const root = `${trimSlash(account.baseUrl)}/api/v3`;

  async function request(path: string, init?: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(root + path, {
        ...init,
        // fetch would follow a redirect with the X-Api-Key header still on, so the key would go to another server.
        redirect: 'manual',
        headers: { 'X-Api-Key': account.apiKey, ...init?.headers },
        // A server that accepts the connection but never answers would otherwise leave the request open forever.
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const host = new URL(root).host;
      if ((error as Error).name === 'TimeoutError') throw new ApiError(0, `${host} didn't answer. Try again later.`);
      throw new ApiError(0, `Can't reach ${host}. Check your connection.`);
    }
    if (response.type === 'opaqueredirect') { // a redirect not followed: the browser hides where it points
      throw new ApiError(response.status, `${new URL(root).host} redirects to another address, which the app doesn't follow. Check the server address.`);
    }
    if (!response.ok) throw new ApiError(response.status, MESSAGES[response.status] ?? `Request failed (HTTP ${response.status}).`);
    return response;
  }

  const json = async <T>(path: string, init?: RequestInit) => (await request(path, init)).json() as Promise<T>;
  const encode = encodeURIComponent;

  return {
    listChecks: async () => (await json<{ checks: Check[] }>('/checks/')).checks,
    getCheck: (id) => json<Check>(`/checks/${encode(id)}`),
    listPings: async (uuid) => (await json<{ pings: Ping[] }>(`/checks/${encode(uuid)}/pings/`)).pings,
    async pingBody(uuid, pingNumber) {
      try {
        return await (await request(`/checks/${encode(uuid)}/pings/${pingNumber}/body`)).text();
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null; // ping has no body
        throw error;
      }
    },
    // The docs show a bare array, but healthchecks.io actually returns
    // {"flips": [...]} (seen 2026-10-11). Accept both.
    async listFlips(id, seconds) {
      const body = await json<Flip[] | { flips: Flip[] }>(`/checks/${encode(id)}/flips/${seconds ? `?seconds=${seconds}` : ''}`);
      return Array.isArray(body) ? body : body.flips ?? [];
    },
    // text/plain is a CORS-safelisted type, so unlike application/json it needn't be in the API's Access-Control-Allow-Headers (only X-Api-Key is).
    // Healthchecks parses the body as JSON whatever its type.
    updateCheck: (uuid, fields) => json<Check>(`/checks/${encode(uuid)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(fields),
    }),
    pause: (uuid) => json<Check>(`/checks/${encode(uuid)}/pause`, { method: 'POST' }),
    async resume(uuid) {
      try {
        return await json<Check>(`/checks/${encode(uuid)}/resume`, { method: 'POST' });
      } catch (error) {
        // Healthchecks answers 409 when the check isn't paused, e.g. a ping or the web UI resumed it first.
        if (error instanceof ApiError && error.status === 409) throw new ApiError(409, "This check isn't paused any more.");
        throw error;
      }
    },
  };
}

/** Read-only keys return `unique_key` instead of `uuid` on each check. */
export function looksReadOnly(checks: Check[]): boolean {
  return checks.length > 0 && checks.every((check) => !check.uuid && !!check.unique_key);
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Links out to the healthchecks.io web UI for anything the app doesn't replicate. */
export const webLinks = {
  dashboard: (baseUrl: string) => `${trimSlash(baseUrl)}/`,
  check: (baseUrl: string, uuid: string) => `${trimSlash(baseUrl)}/checks/${uuid}/details/`,
  account: (baseUrl: string) => `${trimSlash(baseUrl)}/accounts/profile/`,
  apiKeysHelp: 'https://healthchecks.io/docs/api/',
};
