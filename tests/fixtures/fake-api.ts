// A fake healthchecks.io API, by request interception, shared by the browser
// tests (tests/e2e) and the emulator tests (tests/android).

import type { Page } from '@playwright/test';
import type { Check, Flip, Ping } from '@/core/api/types';
import { check, failBody, flipsResponse, pingsResponse, UUID } from './healthchecks';

export interface FakeProject {
  key: string;
  checks: Check[];
  pings?: Record<string, Ping[]>;
  flips?: Record<string, Flip[]>;
  bodies?: Record<string, string>;
}

export const defaultProject = (): FakeProject => ({
  key: 'key-home',
  checks: [structuredClone(check), { ...structuredClone(check), name: 'web', uuid: 'uuid-web', tags: 'prod' }],
  pings: { [UUID]: pingsResponse.pings },
  flips: { [UUID]: flipsResponse.flips },
  bodies: { [`${UUID}/27`]: failBody },
});

/**
 * Serve `projects` for every request to healthchecks.io's API. Mirrors the
 * real server where the app depends on it (wrapped flips, resume clears
 * last_ping, CORS headers). Returns the list of requests made.
 */
export async function fakeApi(page: Page, projects: FakeProject[], options: { delayMs?: number } = {}) {
  const requests: string[] = [];
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'X-Api-Key' };
  await page.route('https://healthchecks.io/api/v3/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' } });
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v3', '');
    requests.push(`${request.method()} ${path}${url.search}`);
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body, headers: cors });
    const project = projects.find((candidate) => candidate.key === request.headers()['x-api-key']);
    if (!project) return json({ error: 'wrong api key' }, 401);
    const find = (id: string) => project.checks.find((check) => check.uuid === id || check.unique_key === id);
    let match: RegExpMatchArray | null;
    if (path === '/checks/') return json({ checks: project.checks });
    if ((match = path.match(/^\/checks\/([^/]+)$/))) {
      const check = find(match[1]);
      if (!check) return json({ error: 'not found' }, 404);
      if (request.method() === 'POST') Object.assign(check, JSON.parse(request.postData() ?? '{}'));
      return json(check);
    }
    if ((match = path.match(/^\/checks\/([^/]+)\/pings\/$/))) return json({ pings: project.pings?.[match[1]] ?? [] });
    if ((match = path.match(/^\/checks\/([^/]+)\/pings\/(\d+)\/body$/))) {
      const body = project.bodies?.[`${match[1]}/${match[2]}`];
      return body === undefined ? json({ error: 'not found' }, 404) : route.fulfill({ body, contentType: 'text/plain', headers: cors });
    }
    if ((match = path.match(/^\/checks\/([^/]+)\/flips\/$/))) return json({ flips: project.flips?.[match[1]] ?? [] });
    if ((match = path.match(/^\/checks\/([^/]+)\/(pause|resume)$/))) {
      const check = find(match[1])!;
      if (match[2] === 'pause') Object.assign(check, { status: 'paused' });
      else Object.assign(check, { status: 'new', last_ping: null, next_ping: null });
      return json(check);
    }
    return json({ error: 'unhandled' }, 500);
  });
  return requests;
}
