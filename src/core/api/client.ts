// Healthchecks.io Management API v3 client. Plain fetch, no framework, so it
// runs unchanged in the browser, Capacitor and Tauri. The API sends
// `Access-Control-Allow-Origin: *`, so browsers can call it directly.

import { demoApi, DEMO_KEY } from './demo';
import type { Check, Flip, Ping } from './types';

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

/** Calls name the check id they take: `checkId` (either kind, from checkIdOf), or `checkRegularKey` where only a regular API key will do. */
export interface HealthchecksApi {
  listChecks(): Promise<Check[]>;
  getCheck(checkId: string): Promise<Check>;
  listPings(checkRegularKey: string): Promise<Ping[]>;
  pingBody(checkRegularKey: string, pingNumber: number): Promise<string | null>;
  listFlips(checkId: string, seconds?: number): Promise<Flip[]>;
  /** Change a check's settings; omitted fields stay as they are. */
  updateCheck(checkRegularKey: string, fields: CheckUpdate): Promise<Check>;
  pause(checkRegularKey: string): Promise<Check>;
  resume(checkRegularKey: string): Promise<Check>;
  /** Whether the key is read-only: healthchecks.io lets only a regular key list the project's integrations. It refuses
   *  a wrong key the same way, so ask only once the key has listed the checks. */
  isReadOnlyKey(): Promise<boolean>;
}

export const REQUEST_TIMEOUT_MS = 15_000;

const MESSAGES: Record<number, string> = {
  401: 'API key rejected. Check it in Settings.',
  403: 'This API key is not allowed to do that (read-only key?).',
  404: 'Not found.',
  429: 'Too many requests. Healthchecks.io allows about 100 per minute.',
  503: 'Healthchecks.io is temporarily unavailable.',
};

/** The only server the app talks to: self-hosted Healthchecks servers aren't supported. */
export const HEALTHCHECKS_URL = 'https://healthchecks.io';
export const HEALTHCHECKS_HOST = new URL(HEALTHCHECKS_URL).host;

/** A client for the project with this API key. */
export function createApi(project: { apiKey: string }): HealthchecksApi {
  if (project.apiKey === DEMO_KEY) return demoApi;

  const root = `${HEALTHCHECKS_URL}/api/v3`;

  async function request(path: string, init?: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(root + path, {
        ...init,
        // fetch would follow a redirect with the X-Api-Key header still on, so the key would go to another server.
        redirect: 'manual',
        headers: { 'X-Api-Key': project.apiKey, ...init?.headers },
        // A server that accepts the connection but never answers would otherwise leave the request open forever.
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if ((error as Error).name === 'TimeoutError') throw new ApiError(0, `${HEALTHCHECKS_HOST} didn't answer. Try again later.`);
      throw new ApiError(0, `Can't reach ${HEALTHCHECKS_HOST}. Check your connection.`);
    }
    if (response.type === 'opaqueredirect') { // a redirect not followed: the browser hides where it points
      throw new ApiError(response.status, `${HEALTHCHECKS_HOST} redirects to another address, which the app doesn't follow.`);
    }
    if (!response.ok) throw new ApiError(response.status, MESSAGES[response.status] ?? `Request failed (HTTP ${response.status}).`);
    return response;
  }

  const json = async <T>(path: string, init?: RequestInit) => (await request(path, init)).json() as Promise<T>;
  const encode = encodeURIComponent;

  return {
    listChecks: async () => (await json<{ checks: Check[] }>('/checks/')).checks,
    getCheck: (checkId) => json<Check>(`/checks/${encode(checkId)}`),
    listPings: async (checkRegularKey) => (await json<{ pings: Ping[] }>(`/checks/${encode(checkRegularKey)}/pings/`)).pings,
    async pingBody(checkRegularKey, pingNumber) {
      try {
        return await (await request(`/checks/${encode(checkRegularKey)}/pings/${pingNumber}/body`)).text();
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null; // ping has no body
        throw error;
      }
    },
    // The docs show a bare array, but healthchecks.io actually returns
    // {"flips": [...]} (seen 2026-10-11). Accept both.
    async listFlips(checkId, seconds) {
      const body = await json<Flip[] | { flips: Flip[] }>(`/checks/${encode(checkId)}/flips/${seconds ? `?seconds=${seconds}` : ''}`);
      return Array.isArray(body) ? body : body.flips ?? [];
    },
    // text/plain is a CORS-safelisted type, so unlike application/json it needn't be in the API's Access-Control-Allow-Headers (only X-Api-Key is).
    // Healthchecks parses the body as JSON whatever its type.
    updateCheck: (checkRegularKey, fields) => json<Check>(`/checks/${encode(checkRegularKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(fields),
    }),
    pause: (checkRegularKey) => json<Check>(`/checks/${encode(checkRegularKey)}/pause`, { method: 'POST' }),
    async resume(checkRegularKey) {
      try {
        return await json<Check>(`/checks/${encode(checkRegularKey)}/resume`, { method: 'POST' });
      } catch (error) {
        // Healthchecks answers 409 when the check isn't paused, e.g. a ping or the web UI resumed it first.
        if (error instanceof ApiError && error.status === 409) throw new ApiError(409, "This check isn't paused any more.");
        throw error;
      }
    },
    async isReadOnlyKey() {
      try {
        await request('/channels/');
        return false;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return true;
        throw error;
      }
    },
  };
}

/** Links out to the healthchecks.io web UI for anything the app doesn't replicate. */
export const webLinks = {
  dashboard: `${HEALTHCHECKS_URL}/`,
  check: (checkRegularKey: string) => `${HEALTHCHECKS_URL}/checks/${checkRegularKey}/details/`,
  // The person's healthchecks.io account, which holds their projects.
  accountSettings: `${HEALTHCHECKS_URL}/accounts/profile/`,
  apiKeysHelp: `${HEALTHCHECKS_URL}/docs/api/`,
};
