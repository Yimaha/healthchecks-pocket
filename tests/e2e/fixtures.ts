// Shared setup for the browser tests: a fake healthchecks.io (via request
// interception), saved projects, a controlled clock, and a guard that fails
// any test which logs a console error.

import { test as base, expect, type Page } from '@playwright/test';
import type { Account, Check, Flip, Ping } from '../../src/core/types';
import { check, failBody, flipsResponse, NOW, pingsResponse, UUID } from '../fixtures/healthchecks';

export { expect, NOW, UUID };

export interface FakeProject {
  key: string;
  checks: Check[];
  pings?: Record<string, Ping[]>;
  flips?: Record<string, Flip[]>;
  bodies?: Record<string, string>;
}

export const defaultProject = (): FakeProject => ({
  key: 'key-home',
  checks: [structuredClone(check), { ...structuredClone(check), name: 'web', slug: 'web', uuid: 'uuid-web', tags: 'prod' }],
  pings: { [UUID]: pingsResponse.pings },
  flips: { [UUID]: flipsResponse.flips },
  bodies: { [`${UUID}/27`]: failBody },
});

export const homeAccount: Account = {
  id: 'p1', name: 'Home lab', baseUrl: 'https://healthchecks.io', apiKey: 'key-home', readOnly: false,
};

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

/** Open the app with these projects already saved on the device. */
export async function openApp(page: Page, options: { accounts?: Account[]; hash?: string; storage?: Record<string, string> } = {}) {
  const accounts = options.accounts ?? [homeAccount];
  await page.addInitScript(
    ({ accounts, storage }) => {
      // Only on the first load of the test; later reloads keep what the app saved.
      if (sessionStorage.getItem('e2e-seeded')) return;
      sessionStorage.setItem('e2e-seeded', '1');
      localStorage.clear();
      localStorage.setItem('healthchecks-pocket.onboarded', '1'); // tests about onboarding override it
      if (accounts.length) {
        // As the app saves them: names/servers as settings, keys as secrets.
        localStorage.setItem('healthchecks-pocket.projects', JSON.stringify(accounts.map(({ id, name, baseUrl, readOnly }) => ({ id, name, baseUrl, readOnly }))));
        for (const account of accounts) localStorage.setItem(`healthchecks-pocket.apiKey.${account.id}`, account.apiKey);
        localStorage.setItem('healthchecks-pocket.active', accounts[0].id);
      }
      for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, value);
    },
    { accounts, storage: options.storage ?? {} },
  );
  await page.goto(`/${options.hash ?? '#/'}`);
}

/** Fails the test on any console error or uncaught exception in the page. */
export const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      page.on('pageerror', (error) => errors.push(error.message));
      await use();
      expect(errors, 'console errors').toEqual([]);
    },
    { auto: true },
  ],
});

/** Freeze the page clock at NOW (fixture time); advance it with page.clock. */
export async function freezeClock(page: Page): Promise<void> {
  // install() alone lets time run on, so "5m 00s ago" became "5m 01s ago" on a slow run. Start a second early, as
  // pauseAt only goes forward, then hold the clock at NOW: timers fire only when a test advances it.
  await page.clock.install({ time: NOW - 1000 });
  await page.clock.pauseAt(NOW);
}
