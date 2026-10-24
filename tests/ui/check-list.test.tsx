import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Check } from '@/core/api/types';
import { check as base, NOW } from '../fixtures/healthchecks';
import { fakeServer, makeProject, startApp, text } from '../helpers';

const MINUTE = 60_000;
const at = (msFromNow: number) => new Date(NOW + msFromNow).toISOString();
const makeCheck = (name: string, extra: Partial<Check>): Check => ({ ...base, name, uuid: `uuid-${name}`, ...extra });

const checks = [
  makeCheck('web', { status: 'up', tags: 'prod web', last_ping: at(-5 * MINUTE), next_ping: at(55 * MINUTE) }),
  makeCheck('backup', { status: 'down', tags: 'nas', last_ping: at(-31 * 60 * MINUTE), next_ping: null }),
  makeCheck('sync', { status: 'grace', tags: 'nas', last_ping: at(-19 * MINUTE), next_ping: at(-4 * MINUTE) }),
  makeCheck('deploy', { status: 'up', tags: 'prod', started: true, last_ping: at(-40_000), next_ping: at(80_000) }),
  makeCheck('reboot', { status: 'paused', tags: '', last_ping: at(-3 * 1440 * MINUTE), next_ping: null }),
  makeCheck('canary', { status: 'new', tags: '', last_ping: null, next_ping: null }),
];

const rows = () => screen.queryAllByRole('link').filter((link) => link.className === 'check-row');
const rowNames = () => rows().map((row) => text(row.querySelector('.check-name')));
const rowMeta = (name: string) => text(rows().find((row) => row.textContent?.includes(name))?.querySelector('.check-meta'));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
});

describe('check list', () => {
  it('shows the app name in the header and the project under it', async () => {
    fakeServer([{ key: 'key-home', checks }]);
    startApp();
    // While saved projects load: the startup screen, over the northern lights.
    expect(screen.getByRole('status').textContent).toBe('Getting Healthchecks Pocket ready…');
    expect(document.querySelector('.aurora')).not.toBeNull();
    await waitFor(() => expect(text(document.querySelector('.project-name'))).toBe('Home lab'));
    expect(document.querySelector('.startup')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toHaveProperty('textContent', 'Healthchecks Pocket');
    await waitFor(() => expect(rows()).toHaveLength(6));
  });

  it('sorts down, late, new, up, then paused, alphabetically within each', async () => {
    fakeServer([{ key: 'key-home', checks }]);
    startApp();
    await waitFor(() => expect(rowNames()).toEqual(['backup', 'sync', 'canary', 'deploy', 'web', 'reboot']));
  });

  it('summarises counts by status', async () => {
    fakeServer([{ key: 'key-home', checks }]);
    startApp();
    await waitFor(() => expect(text(document.querySelector('.summary'))).toBe('1 down 1 late 2 up 1 new 1 paused'));
  });

  it('describes each check\'s last and next ping', async () => {
    fakeServer([{ key: 'key-home', checks }]);
    startApp();
    await waitFor(() => expect(rows()).toHaveLength(6));
    expect(rowMeta('web')).toBe('last ping 5m 00s ago · next in 55m 00s');
    expect(rowMeta('sync')).toBe('last ping 19m 00s ago · overdue by 4m 00s');
    expect(rowMeta('backup')).toBe('last ping 1d 07h ago');
    expect(rowMeta('deploy')).toBe('running · last ping 40s ago · next in 1m 20s');
    expect(rowMeta('reboot')).toBe('paused');
    expect(rowMeta('canary')).toBe('last ping never');
  });

  it('calls a check without a name an unnamed check, not by the slug healthchecks.io also sends', async () => {
    const unnamedCheck = { ...makeCheck('', { status: 'up' }), slug: 'nightly-backup' };
    fakeServer([{ key: 'key-home', checks: [unnamedCheck] }]);
    startApp();
    await waitFor(() => expect(rowNames()).toEqual(['Unnamed check']));
  });

  it('ticks relative times every second', async () => {
    fakeServer([{ key: 'key-home', checks }]);
    startApp();
    await waitFor(() => expect(rowMeta('web')).toBe('last ping 5m 00s ago · next in 55m 00s'));
    act(() => vi.setSystemTime(NOW + 7_000));
    await waitFor(() => expect(rowMeta('web')).toBe('last ping 5m 07s ago · next in 54m 53s'), { timeout: 2500 });
  });

  it('filters by tag, and All or the same tag clears the filter', async () => {
    fakeServer([{ key: 'key-home', checks }]);
    const { user } = startApp();
    await waitFor(() => expect(rows()).toHaveLength(6));
    const tags = within(screen.getByRole('group', { name: 'Filter by tag' }));
    expect(tags.getAllByRole('button').map((button) => button.textContent)).toEqual(['All', 'nas', 'prod', 'web']);

    await user.click(tags.getByRole('button', { name: 'nas' }));
    expect(rowNames()).toEqual(['backup', 'sync']);
    await user.click(tags.getByRole('button', { name: 'prod' }));
    expect(rowNames()).toEqual(['deploy', 'web']);
    await user.click(tags.getByRole('button', { name: 'prod' }));
    expect(rows()).toHaveLength(6);
    await user.click(tags.getByRole('button', { name: 'web' }));
    await user.click(tags.getByRole('button', { name: 'All' }));
    expect(rows()).toHaveLength(6);
  });

  it('opens a check when its row is tapped', async () => {
    fakeServer([{ key: 'key-home', checks }]);
    const { user } = startApp();
    await waitFor(() => expect(rows()).toHaveLength(6));
    await user.click(screen.getByText('backup'));
    expect(window.location.hash).toBe('#/check/uuid-backup');
  });

  it('says so when the project has no checks', async () => {
    fakeServer([{ key: 'key-home', checks: [] }]);
    startApp();
    expect(await screen.findByText('No checks in this project yet. Create them on healthchecks.io.')).toBeTruthy();
    expect(document.querySelector('.list')).toBeNull();
  });

  it('shows errors with a working Retry', async () => {
    const server = fakeServer([{ key: 'key-home', checks }]);
    server.fail(/GET \/api\/v3\/checks\/$/, 503);
    const { user } = startApp();
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Healthchecks.io is temporarily unavailable.Retry'); // raw textContent
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(rows()).toHaveLength(6));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('reports a rejected key', async () => {
    fakeServer([{ key: 'some-other-key', checks }]);
    startApp();
    expect(text(await screen.findByRole('alert'))).toBe('API key rejected. Check it in Settings. Retry');
  });
});

describe('projects', () => {
  const work = makeProject({ id: 'p2', name: 'Work', apiKey: 'key-work' });

  it('offers a picker with several projects, and switching loads that project', async () => {
    fakeServer([
      { key: 'key-home', checks: [checks[0]] },
      { key: 'key-work', checks: [makeCheck('payroll', {}), makeCheck('ci', {})] },
    ]);
    const { user } = startApp({ projects: [makeProject(), work] });
    await waitFor(() => expect(rowNames()).toEqual(['web']));

    const picker = screen.getByRole('combobox', { name: '' }) as HTMLSelectElement;
    expect([...picker.options].map((option) => option.text)).toEqual(['Home lab', 'Work']);
    await user.selectOptions(document.querySelector('.project-picker')!, 'p2');
    await waitFor(() => expect(rowNames()).toEqual(['ci', 'payroll']));
    expect(localStorage.getItem('healthchecks-pocket.active')).toBe('p2');
  });

  it("switching never shows the previous project's checks, even when the new one fails to load", async () => {
    fakeServer([{ key: 'key-home', checks: [checks[0]] }]); // no project for key-work: 401
    const { user } = startApp({ projects: [makeProject(), work] });
    await waitFor(() => expect(rowNames()).toEqual(['web']));
    await user.selectOptions(document.querySelector('.project-picker')!, 'p2');
    await screen.findByText('API key rejected. Check it in Settings.');
    expect(rowNames()).toEqual([]);
  });

  it('switching starts without a tag filter', async () => {
    fakeServer([
      { key: 'key-home', checks },
      { key: 'key-work', checks: [makeCheck('payroll', { tags: '' }), makeCheck('ci', { tags: '' })] },
    ]);
    const { user } = startApp({ projects: [makeProject(), work] });
    await waitFor(() => expect(rows()).toHaveLength(6));
    await user.click(screen.getByRole('button', { name: 'nas' }));
    await user.selectOptions(document.querySelector('.project-picker')!, 'p2');
    await waitFor(() => expect(rowNames()).toEqual(['ci', 'payroll']));
  });
});

describe('time zone', () => {
  const picker = () => document.querySelector('.tz-picker') as HTMLSelectElement;
  const updated = () => text(document.querySelector('.updated'));

  it('lists the device zone first as the default, then UTC', async () => {
    fakeServer([{ key: 'key-home', checks }]);
    startApp();
    await waitFor(() => expect(rows()).toHaveLength(6));
    const options = [...picker().options];
    expect(options[0]).toMatchObject({ value: 'system', text: 'Asia/Tokyo (UTC+9), default', selected: true });
    expect(options[1]).toMatchObject({ value: 'UTC', text: 'UTC' });
    expect(options.length).toBeGreaterThan(300);
  });

  it('shows when the list was updated, in the chosen zone, and remembers the choice', async () => {
    fakeServer([{ key: 'key-home', checks }]);
    const { user } = startApp();
    await waitFor(() => expect(updated()).toBe('Updated Oct 12, 05:00:00 AM GMT+9'));

    await user.selectOptions(picker(), 'UTC');
    expect(updated()).toBe('Updated Oct 11, 08:00:00 PM UTC');
    expect(localStorage.getItem('healthchecks-pocket.timezone')).toBe('UTC');

    await user.selectOptions(picker(), 'Europe/Berlin');
    expect(updated()).toBe('Updated Oct 11, 10:00:00 PM GMT+2');
  });

  it('restores the saved zone on start', async () => {
    localStorage.setItem('healthchecks-pocket.timezone', 'UTC');
    fakeServer([{ key: 'key-home', checks }]);
    startApp();
    await waitFor(() => expect(updated()).toBe('Updated Oct 11, 08:00:00 PM UTC'));
    expect(picker().value).toBe('UTC');
  });
});

describe('refresh', () => {
  const button = () => screen.getByRole('button', { name: 'Refresh' });
  const spinning = () => !!button().querySelector('.spinning');
  const progress = () => document.querySelector('[role="progressbar"]');

  it('a tap spins for at least 800ms with a progress bar, then refetches', async () => {
    vi.useFakeTimers({ now: NOW });
    const server = fakeServer([{ key: 'key-home', checks }]);
    startApp();
    await act(() => vi.advanceTimersByTimeAsync(50));
    expect(rows()).toHaveLength(6);
    const before = server.count(/GET \/api\/v3\/checks\/$/);

    act(() => fireEvent.click(button()));
    expect(spinning()).toBe(true);
    expect(progress()).not.toBeNull();
    expect(button()).toHaveProperty('disabled', true);
    expect(server.count(/GET \/api\/v3\/checks\/$/)).toBe(before + 1);

    await act(() => vi.advanceTimersByTimeAsync(700)); // data is back, but under 800ms
    expect(progress()).not.toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(150));
    expect(progress()).toBeNull();
    expect(spinning()).toBe(false);
    expect(button()).toHaveProperty('disabled', false);
  });

  it('refreshes by itself every minute, without the progress bar', async () => {
    vi.useFakeTimers({ now: NOW });
    const server = fakeServer([{ key: 'key-home', checks }]);
    startApp();
    await act(() => vi.advanceTimersByTimeAsync(50));
    const before = server.count(/GET \/api\/v3\/checks\/$/);
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(server.count(/GET \/api\/v3\/checks\/$/)).toBe(before + 1);
    expect(progress()).toBeNull();
  });
});

describe('northern lights while loading', () => {
  const lights = () => document.querySelector('.aurora-loading');

  it('(set to "while loading") show behind the list while checks load, and again on Refresh', async () => {
    localStorage.setItem('healthchecks-pocket.lights', 'loading');
    fakeServer([{ key: 'key-home', checks }]);
    startApp();
    await waitFor(() => expect(rows()).toHaveLength(6));
    expect(lights()).not.toBeNull(); // still showing for a moment after a quick load (timing: building-blocks)
    expect(lights()!.getAttribute('aria-hidden')).toBe('true');
    await waitFor(() => expect(lights()).toBeNull(), { timeout: 10_000 });

    act(() => screen.getByRole('button', { name: 'Refresh' }).click());
    expect(lights()).not.toBeNull();
  }, 20_000);
});
