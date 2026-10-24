// Shared helpers for screen tests: a fake healthchecks.io server behind
// `fetch`, and a way to start the app with saved projects.

import { render, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import type { Check, Flip, Ping, Project, SavedProject } from '@/core/api/types';
import { App } from '@/ui/App';

export interface FakeProject {
  key: string;
  checks: Check[];
  pings?: Record<string, Ping[]>; // by uuid
  flips?: Record<string, Flip[]>; // by uuid or unique_key
  bodies?: Record<string, string>; // `${uuid}/${n}`
}

export interface FakeRequest {
  method: string;
  path: string;
  key: string | null;
  contentType: string | null;
  body: unknown;
}

/**
 * Stands in for healthchecks.io. Behaves
 * like the real API where the app depends on it: flips come wrapped in
 * {"flips": [...]}, resume resets a check to New and clears last_ping, resume
 * of a check that isn't paused is a 409, unknown keys get a 401.
 */
export function fakeServer(projects: FakeProject[]) {
  const requests: FakeRequest[] = [];
  const failures: { match: RegExp; status: number; times: number }[] = [];
  const projectFor = (key: string | null) => projects.find((project) => project.key === key);

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const handler = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const key = headers['X-Api-Key'] ?? null;
    const raw = init?.body ? String(init.body) : null;
    const request: FakeRequest = {
      method,
      path: url.pathname + url.search,
      key,
      contentType: headers['Content-Type'] ?? null,
      body: raw ? JSON.parse(raw) : null,
    };
    requests.push(request);

    // Like the browser's fetch, which refuses a header value with a character beyond Latin-1.
    if (key && [...key].some((keyCharacter) => keyCharacter.codePointAt(0)! > 0xff)) throw new TypeError('Invalid header value');

    if (url.origin !== 'https://healthchecks.io') throw new TypeError('Failed to fetch');
    const failure = failures.find((candidate) => candidate.times > 0 && candidate.match.test(`${method} ${request.path}`));
    if (failure) {
      failure.times--;
      return json({ error: 'injected' }, failure.status);
    }
    const project = projectFor(key);
    if (!project) return json({ error: 'wrong api key' }, 401);

    const path = url.pathname.replace(/^\/api\/v3/, '');
    const find = (id: string) => project.checks.find((check) => check.uuid === id || check.unique_key === id);
    let match: RegExpMatchArray | null;

    if (method === 'GET' && path === '/checks/') return json({ checks: project.checks });
    if ((match = path.match(/^\/checks\/([^/]+)$/))) {
      const check = find(decodeURIComponent(match[1]));
      if (!check) return json({ error: 'not found' }, 404);
      if (method === 'POST') {
        Object.assign(check, request.body);
        return json(check);
      }
      return json(check);
    }
    if ((match = path.match(/^\/checks\/([^/]+)\/pings\/$/))) return json({ pings: project.pings?.[match[1]] ?? [] });
    if ((match = path.match(/^\/checks\/([^/]+)\/pings\/(\d+)\/body$/))) {
      const body = project.bodies?.[`${match[1]}/${match[2]}`];
      return body === undefined ? json({ error: 'not found' }, 404) : new Response(body, { headers: { 'Content-Type': 'text/plain' } });
    }
    if ((match = path.match(/^\/checks\/([^/]+)\/flips\/$/))) return json({ flips: project.flips?.[match[1]] ?? [] });
    if (method === 'POST' && (match = path.match(/^\/checks\/([^/]+)\/(pause|resume)$/))) {
      const check = find(match[1]);
      if (!check) return json({ error: 'not found' }, 404);
      if (match[2] === 'pause') Object.assign(check, { status: 'paused' });
      else if (check.status !== 'paused') return new Response('check is not paused', { status: 409 });
      else Object.assign(check, { status: 'new', last_ping: null, next_ping: null });
      return json(check);
    }
    return json({ error: `unhandled ${method} ${url.pathname}` }, 500);
  });

  vi.stubGlobal('fetch', handler);
  return {
    requests,
    /** Requests other than the read-only GETs, e.g. ["POST /api/v3/checks/<id>/pause"]. */
    writes: () => requests.filter((request) => request.method !== 'GET').map((request) => `${request.method} ${request.path}`),
    count: (pattern: RegExp) => requests.filter((request) => pattern.test(`${request.method} ${request.path}`)).length,
    /** Make the next `times` matching requests fail with `status`. */
    fail(match: RegExp, status: number, times = 1) {
      failures.push({ match, status, times });
    },
  };
}

export function makeProject(overrides: Partial<Project> = {}): Project {
  return { id: 'p1', name: 'Home lab', apiKey: 'key-home', readOnly: false, pingLogDays: 7, ...overrides };
}

/** Save projects the way the app does: the projects as a setting, each
 *  API key as its own secret (on the web, both are localStorage). */
export function seedSavedProjects(projects: Project[]) {
  localStorage.setItem('healthchecks-pocket.projects', JSON.stringify(projects.map(({ id, name, readOnly, pingLogDays }): SavedProject => ({ id, name, readOnly, pingLogDays }))));
  for (const project of projects) if (project.apiKey) localStorage.setItem(`healthchecks-pocket.apiKey.${project.id}`, project.apiKey);
}

/** The projects saved on the device, keys joined back in ('' when missing). */
export function savedProjectsWithKeys(): Project[] {
  const savedProjects: SavedProject[] = JSON.parse(localStorage.getItem('healthchecks-pocket.projects') ?? '[]');
  return savedProjects.map((savedProject) => ({ ...savedProject, apiKey: localStorage.getItem(`healthchecks-pocket.apiKey.${savedProject.id}`) ?? '' }));
}

/** Start the app as if these projects were saved on the device. */
export function startApp(options: { projects?: Project[]; activeProjectId?: string; hash?: string; onboarded?: boolean } = {}): RenderResult & { user: ReturnType<typeof userEvent.setup> } {
  const projects = options.projects ?? [makeProject()];
  // Past the first-launch settings page, unless a test is about it.
  if (options.onboarded !== false) localStorage.setItem('healthchecks-pocket.onboarded', '1');
  if (projects.length) {
    seedSavedProjects(projects);
    localStorage.setItem('healthchecks-pocket.active', options.activeProjectId ?? projects[0].id);
  }
  window.location.hash = options.hash ?? '#/';
  // userEvent waits between actions; with fake timers it must advance them.
  const user = userEvent.setup({ advanceTimers: (ms) => { if (vi.isFakeTimers()) vi.advanceTimersByTime(ms); } });
  return { ...render(<App />), user };
}

/** Accept (true) or cancel (false) the next confirm() dialogs, recording their text. */
export function answerConfirms(...answers: boolean[]) {
  const asked: string[] = [];
  vi.spyOn(window, 'confirm').mockImplementation((message?: string) => {
    asked.push(String(message));
    return answers.length ? answers.shift()! : true;
  });
  return asked;
}

/** Text as a person reads it: separate elements separated by a space (so
 *  "Up" + "running now" isn't "Uprunning now"), runs of text kept intact
 *  ("#" + "25" stays "#25"), whitespace collapsed. */
export function text(element: Element | null | undefined): string {
  const words = (node: Node): string =>
    node.nodeType === Node.TEXT_NODE ? node.textContent ?? '' : [...node.childNodes].map((child) => (child.nodeType === Node.ELEMENT_NODE ? ` ${words(child)} ` : words(child))).join('');
  return element ? words(element).replace(/\s+/g, ' ').trim() : '';
}
