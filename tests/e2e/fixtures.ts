// Shared setup for the browser tests: a fake healthchecks.io (via request
// interception, tests/fixtures/fake-api.ts), saved projects, a controlled
// clock, and a guard that fails any test which logs a console error.

import { createServer, type RequestListener } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test as base, expect, type Page } from '@playwright/test';
import type { Project } from '../../src/core/types';
import { NOW, UUID } from '../fixtures/healthchecks';

export { expect, NOW, UUID };
export { defaultProject, fakeApi, type FakeProject } from '../fixtures/fake-api';

export const homeProject: Project = {
  id: 'p1', name: 'Home lab', baseUrl: 'https://healthchecks.io', apiKey: 'key-home', readOnly: false, pingLogDays: 7,
};

/** Open the app with these projects already saved on the device. */
export async function openApp(page: Page, options: { projects?: Project[]; hash?: string; storage?: Record<string, string> } = {}) {
  const projects = options.projects ?? [homeProject];
  await page.addInitScript(
    ({ projects, storage }) => {
      // Only on the first load of the test; later reloads keep what the app saved.
      if (sessionStorage.getItem('e2e-seeded')) return;
      sessionStorage.setItem('e2e-seeded', '1');
      localStorage.clear();
      localStorage.setItem('healthchecks-pocket.onboarded', '1'); // tests about onboarding override it
      if (projects.length) {
        // As the app saves them: names/servers as settings, keys as secrets.
        localStorage.setItem('healthchecks-pocket.projects', JSON.stringify(projects.map(({ id, name, baseUrl, readOnly, pingLogDays }) => ({ id, name, baseUrl, readOnly, pingLogDays }))));
        for (const project of projects) localStorage.setItem(`healthchecks-pocket.apiKey.${project.id}`, project.apiKey);
        localStorage.setItem('healthchecks-pocket.active', projects[0].id);
      }
      for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, value);
    },
    { projects, storage: options.storage ?? {} },
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

/** A real HTTP server on a free port of this machine, for what page.route() can't fake. */
export async function startLocalServer(handleRequest: RequestListener): Promise<{ origin: string; stop: () => void }> {
  const server = createServer(handleRequest);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    stop: () => { server.closeAllConnections(); server.close(); },
  };
}

/** Freeze the page clock at NOW (fixture time); advance it with page.clock. */
export async function freezeClock(page: Page): Promise<void> {
  // install() alone lets time run on, so "5m 00s ago" became "5m 01s ago" on a slow run. Start a second early, as
  // pauseAt only goes forward, then hold the clock at NOW: timers fire only when a test advances it.
  await page.clock.install({ time: NOW - 1000 });
  await page.clock.pauseAt(NOW);
}
