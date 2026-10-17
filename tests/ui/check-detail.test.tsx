import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Check, Ping } from '../../src/core/types';
import { check as base, flipsResponse, NOW, readOnlyCheck, UUID } from '../fixtures/healthchecks';
import { account, answerConfirms, fakeServer, type FakeProject, startApp, text } from '../helpers';

const MINUTE = 60_000;
const at = (msFromNow: number) => new Date(NOW + msFromNow).toISOString();

/** n pings, newest first, one an hour; #(n-2) is a failure, #(n-3) a start. */
function pingLog(count: number): Ping[] {
  return Array.from({ length: count }, (_, i) => ({
    n: count - i,
    type: i === 2 ? 'fail' : i === 3 ? 'start' : 'success',
    date: at(-(5 + 60 * i) * MINUTE),
    scheme: 'https',
    remote_addr: '203.0.113.9',
    method: 'POST',
    ua: 'curl/8.5.0',
    ...(i === 1 ? { duration: 3.2 } : {}),
  }));
}

const other: Check = { ...base, name: 'web', slug: 'web', uuid: 'uuid-web', tags: 'prod pi' };

function project(overrides: Partial<Check> = {}, extra: Partial<FakeProject> = {}): FakeProject {
  return {
    key: 'key-home',
    checks: [{ ...base, ...overrides }, other],
    pings: { [UUID]: pingLog(25) },
    flips: { [UUID]: flipsResponse.flips },
    bodies: {},
    ...extra,
  };
}

const open = (options: Parameters<typeof startApp>[0] = {}) => startApp({ hash: `#/check/${UUID}`, ...options });
const loaded = () => waitFor(() => expect(document.querySelectorAll('.ping-row').length).toBeGreaterThan(0));
const facts = () => text(document.querySelector('.facts'));
const badge = () => text(document.querySelector('.badge'));
const toggle = (title: string) => [...document.querySelectorAll('.section-toggle')].find((button) => button.textContent?.startsWith(title)) as HTMLButtonElement;
const pingRows = () => [...document.querySelectorAll('.ping-row')].map((row) => text(row));
const flipRows = () => [...document.querySelectorAll('.flip-row')].map((row) => text(row));
const button = (name: string) => screen.getByRole('button', { name });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
});

describe('layout', () => {
  it('shows status first, then status changes, ping log, pause and the healthchecks.io link', async () => {
    fakeServer([project()]);
    open();
    await loaded();
    const page = text(document.querySelector('main'));
    const order = ['Up', 'Last ping', 'Status changes (30 days)', 'Ping log', 'Pause monitoring', 'On healthchecks.io'];
    const positions = order.map((label) => page.indexOf(label));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((first, second) => first - second)).toEqual(positions);
  });

  it('puts the check\'s details above its last ping', async () => {
    fakeServer([project()]);
    open();
    await loaded();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('backup-server');
    expect(text(document.querySelector('.desc'))).toBe('Nightly backup heartbeat');
    // Uptime: up since 3 days ago, then down for 5 minutes (fixtures).
    await waitFor(() => expect(facts()).toContain('Uptime'));
    expect(facts()).toBe(
      'Name backup-server Rename Schedule Every 1h, 1h grace Total pings 29 Uptime 99.88% since Oct 9, 05:00:00 AM · down 5m ' +
        'Tags home nas Edit tags Last ping 5m 00s ago Oct 12, 04:55:00 AM Next expected in 55m 00s',
    );
  });

  it('shows 30 days of uptime without status changes, and none for a new check', async () => {
    fakeServer([project({}, { flips: {} })]);
    const { unmount } = open();
    await loaded();
    await waitFor(() => expect(facts()).toContain('Uptime 100% last 30 days · no downtime'));
    unmount();
    fakeServer([project({ status: 'new' }, { flips: {} })]);
    open();
    await loaded();
    await screen.findByText('No status changes in the last 30 days.');
    expect(facts()).not.toContain('Uptime');
  });

  it('says when the next ping is overdue', async () => {
    fakeServer([project({ status: 'grace', next_ping: at(-4 * MINUTE) })]);
    open();
    await loaded();
    expect(badge()).toBe('Late');
    expect(facts()).toContain('Next expected overdue (was due 4m 00s ago)');
  });

  it('hides "next expected" while paused', async () => {
    fakeServer([project({ status: 'paused' })]);
    open();
    await loaded();
    expect(badge()).toBe('Paused');
    expect(facts()).not.toContain('Next expected');
  });

  it('shows a running check and a check with no tags', async () => {
    fakeServer([project({ started: true, tags: '' })]);
    open();
    await loaded();
    expect(text(document.querySelector('.card-row'))).toBe('Up running now');
    expect(facts()).toContain('Tags none Edit tags');
  });

  it('uses the chosen time zone for exact times', async () => {
    localStorage.setItem('healthchecks-pocket.timezone', 'UTC');
    fakeServer([project()]);
    open();
    await loaded();
    expect(facts()).toContain('Last ping 5m 00s ago Oct 11, 07:55:00 PM');
    expect(pingRows()[0]).toContain('Oct 11, 07:55:00 PM · #25');
  });
});

describe('status changes', () => {
  it('lists them newest first; pausing and resuming count as "down or paused"', async () => {
    fakeServer([project()]);
    open();
    await loaded();
    expect(text(toggle('Status changes'))).toBe('Status changes (30 days) 3');
    expect(screen.getByText(/healthchecks.io also records pausing and resuming as not up/)).toBeTruthy();
    expect(flipRows()).toEqual([
      'Went up 2h 00m ago · Oct 12, 03:00:00 AM',
      'Down or paused 2h 05m ago · Oct 12, 02:55:00 AM',
      'Went up 3d 00h ago · Oct 9, 05:00:00 AM',
    ]);
  });

  it('asks for the last 30 days', async () => {
    const server = fakeServer([project()]);
    open();
    await loaded();
    expect(server.count(new RegExp(`GET /api/v3/checks/${UUID}/flips/\\?seconds=2592000$`))).toBe(1);
  });

  it('says when there are none', async () => {
    fakeServer([project({}, { flips: {} })]);
    open();
    expect(await screen.findByText('No status changes in the last 30 days.')).toBeTruthy();
  });
});

describe('ping log', () => {
  it('shows the latest 20 with time, number and type, and can show all', async () => {
    fakeServer([project()]);
    open();
    await loaded();
    expect(text(toggle('Ping log'))).toBe('Ping log 25');
    expect(pingRows()).toHaveLength(20);
    expect(pingRows().slice(0, 4)).toEqual([
      'OK 5m 00s ago Oct 12, 04:55:00 AM · #25',
      'OK 1h 05m ago · took 3s Oct 12, 03:55:00 AM · #24',
      'Failure 2h 05m ago Oct 12, 02:55:00 AM · #23',
      'Started 3h 05m ago Oct 12, 01:55:00 AM · #22',
    ]);
    fireEvent.click(button('Show all 25'));
    expect(pingRows()).toHaveLength(25);
    fireEvent.click(button('Show latest 20'));
    expect(pingRows()).toHaveLength(20);
  });

  it('has no Show all button with 20 or fewer pings', async () => {
    fakeServer([project({}, { pings: { [UUID]: pingLog(20) } })]);
    open();
    await loaded();
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull();
  });

  it('opens a ping\'s body', async () => {
    fakeServer([project()]);
    const { user } = open();
    await loaded();
    await user.click(screen.getByText(/· #23$/));
    expect(window.location.hash).toBe(`#/check/${UUID}/ping/23`);
  });

  it('says when there are no pings yet', async () => {
    fakeServer([project({}, { pings: {} })]);
    open();
    expect(await screen.findByText('No pings yet.')).toBeTruthy();
  });
});

describe('folding', () => {
  it('folds a section on tap and remembers it', async () => {
    fakeServer([project()]);
    open();
    await loaded();
    fireEvent.click(toggle('Ping log'));
    expect(toggle('Ping log').getAttribute('aria-expanded')).toBe('false');
    expect(pingRows()).toHaveLength(0);
    expect(flipRows()).toHaveLength(3); // other sections stay open
    expect(localStorage.getItem('healthchecks-pocket.section.pings')).toBe('0');

    cleanup();
    open();
    await waitFor(() => expect(toggle('Ping log')?.getAttribute('aria-expanded')).toBe('false'));
    expect(pingRows()).toHaveLength(0);
    fireEvent.click(toggle('Ping log'));
    await loaded();
    expect(localStorage.getItem('healthchecks-pocket.section.pings')).toBe('1');
  });

  it('folds status changes independently', async () => {
    fakeServer([project()]);
    open();
    await loaded();
    fireEvent.click(toggle('Status changes'));
    expect(flipRows()).toHaveLength(0);
    expect(pingRows()).toHaveLength(20);
    expect(localStorage.getItem('healthchecks-pocket.section.flips')).toBe('0');
  });
});

describe('with a read-only key', () => {
  const readOnlyProject = { key: 'key-ro', checks: [readOnlyCheck], flips: { [readOnlyCheck.unique_key!]: flipsResponse.flips } };
  const roAccount = account({ apiKey: 'key-ro', readOnly: true });

  it('shows status and status changes, explains the missing ping log, and offers no pause or tag edits', async () => {
    const server = fakeServer([readOnlyProject]);
    startApp({ accounts: [roAccount], hash: `#/check/${readOnlyCheck.unique_key}` });
    expect(await screen.findByText('Ping logs need a regular API key; this project uses a read-only key.')).toBeTruthy();
    await waitFor(() => expect(flipRows()).toHaveLength(3));
    expect(screen.queryByRole('button', { name: /monitoring/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit tags' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Rename' })).toBeNull();
    expect(text(document.querySelector('.row-link'))).toBe('Open Home lab dashboard Read-only key: opens the dashboard');
    expect(server.count(/pings/)).toBe(0);
  });
});

describe('pause and resume', () => {
  it('asks before pausing, and does nothing if cancelled', async () => {
    const server = fakeServer([project()]);
    const asked = answerConfirms(false);
    open();
    await loaded();
    expect(text(document.querySelector('.card-spaced .hint-text'))).toBe(
      'Pausing stops alerts (e.g. during maintenance). The next ping resumes it automatically.',
    );
    fireEvent.click(button('Pause monitoring'));
    expect(asked).toEqual(['Pause "backup-server"? It won\'t send alerts until its next ping (or you resume it here).']);
    expect(server.writes()).toEqual([]);
  });

  it('pauses: status Paused, last ping kept, Resume offered', async () => {
    const server = fakeServer([project()]);
    answerConfirms(true);
    open();
    await loaded();
    fireEvent.click(button('Pause monitoring'));
    await waitFor(() => expect(badge()).toBe('Paused'));
    expect(server.writes()).toEqual([`POST /api/v3/checks/${UUID}/pause`]);
    expect(facts()).toContain('Last ping 5m 00s ago Oct 12, 04:55:00 AM');
    expect(facts()).not.toContain('from the ping log');
    expect(button('Resume monitoring')).toBeTruthy();
    expect(text(document.querySelector('.card-spaced .hint-text'))).toBe(
      'Paused: no alerts. The next ping resumes monitoring. Resume resets it to New (clearing its last ping); it alerts again after its next ping.',
    );
  });

  it('asks before resuming (it sits where Pause was), then shows New with the last ping from the log', async () => {
    const server = fakeServer([project({ status: 'paused' })]);
    const asked = answerConfirms(false, true);
    open();
    await loaded();
    fireEvent.click(button('Resume monitoring'));
    expect(server.writes()).toEqual([]); // cancelled
    fireEvent.click(button('Resume monitoring'));
    expect(asked[1]).toBe(
      'Resume "backup-server"? It goes back to New, its last ping is cleared, and it alerts again after its next ping.',
    );
    await waitFor(() => expect(badge()).toBe('New'));
    expect(server.writes()).toEqual([`POST /api/v3/checks/${UUID}/resume`]);
    expect(facts()).toContain(
      'Last ping 5m 00s ago Oct 12, 04:55:00 AM · from the ping log (cleared when monitoring resumed)',
    );
    expect(button('Pause monitoring')).toBeTruthy();
  });

  it('says when the check was resumed elsewhere first (HTTP 409), and shows its status now', async () => {
    const pausedProject = project({ status: 'paused' });
    fakeServer([pausedProject]);
    answerConfirms(true);
    open();
    await loaded();
    // A ping resumes it on healthchecks.io while the page still shows Paused.
    pausedProject.checks[0].status = 'up';
    fireEvent.click(button('Resume monitoring'));
    expect(text(await screen.findByRole('alert'))).toBe("This check isn't paused any more.");
    await waitFor(() => expect(badge()).toBe('Up'));
    expect(button('Pause monitoring')).toHaveProperty('disabled', false);
  });

  it('shows "never" when the last ping was cleared and the log is empty', async () => {
    fakeServer([project({ status: 'new', last_ping: null, next_ping: null }, { pings: {} })]);
    open();
    expect(await screen.findByText('No pings yet.')).toBeTruthy();
    expect(facts()).toContain('Last ping never');
  });

  it('explains manual resume', async () => {
    fakeServer([project({ manual_resume: true })]);
    const asked = answerConfirms(true);
    open();
    await loaded();
    expect(text(document.querySelector('.card-spaced .hint-text'))).toBe(
      'Pausing stops alerts (e.g. during maintenance). It stays paused until you resume it.',
    );
    fireEvent.click(button('Pause monitoring'));
    expect(asked[0]).toBe('Pause "backup-server"? It won\'t send alerts until you resume it here.');
    await waitFor(() => expect(badge()).toBe('Paused'));
    expect(text(document.querySelector('.card-spaced .hint-text'))).toBe(
      'Paused: no alerts, and pings are ignored until you resume. Resuming resets it to New (clearing its last ping); it alerts again after its next ping.',
    );
  });

  it('shows an error if pausing fails, and leaves the status alone', async () => {
    const server = fakeServer([project()]);
    server.fail(/POST .*\/pause$/, 500);
    answerConfirms(true);
    open();
    await loaded();
    fireEvent.click(button('Pause monitoring'));
    expect(text(await screen.findByRole('alert'))).toBe('Request failed (HTTP 500).');
    expect(badge()).toBe('Up');
    expect(button('Pause monitoring')).toHaveProperty('disabled', false);
  });
});

describe('healthchecks.io link', () => {
  it('names the check and highlights the project, and opens the check\'s page', async () => {
    fakeServer([project()]);
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    open();
    await loaded();
    expect(text(document.querySelector('.section-title-row'))).toBe('On healthchecks.io Home lab');
    expect(text(document.querySelector('.project-chip'))).toBe('Home lab');
    const link = document.querySelector('.row-link')!;
    expect(text(link)).toBe('Open “backup-server” in Home lab Edit check, schedule & integrations');
    fireEvent.click(link);
    expect(openSpy).toHaveBeenCalledWith(`https://healthchecks.io/checks/${UUID}/details/`, '_blank', 'noopener,noreferrer');
  });

  it('uses a self-hosted server for both requests and links', async () => {
    const server = fakeServer([project()], 'https://hc.example.org');
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    open({ accounts: [account({ baseUrl: 'https://hc.example.org' })] });
    await loaded();
    expect(server.requests.every((request) => request.path.startsWith('/api/v3/'))).toBe(true);
    fireEvent.click(document.querySelector('.row-link')!);
    expect(openSpy).toHaveBeenCalledWith(`https://hc.example.org/checks/${UUID}/details/`, '_blank', 'noopener,noreferrer');
  });
});

describe('refresh', () => {
  it('reloads the check, its pings and status changes', async () => {
    const server = fakeServer([project()]);
    open();
    await loaded();
    const counts = () => [/checks\/[^/]+$/, /pings\/$/, /flips\//].map((pattern) => server.count(pattern));
    const before = counts();
    act(() => fireEvent.click(button('Refresh')));
    await waitFor(() => expect(counts()).toEqual(before.map((count) => count + 1)));
  });
});

describe('renaming a check', () => {
  const nameInput = () => screen.getByRole('textbox', { name: 'Check name' }) as HTMLInputElement;
  const heading = () => screen.getByRole('heading', { level: 1 }).textContent;

  it('saves the new name to healthchecks.io, and the page shows it', async () => {
    const server = fakeServer([project()]);
    const { user } = open();
    await loaded();
    await user.click(button('Rename'));
    expect(nameInput().value).toBe('backup-server');
    expect(nameInput().maxLength).toBe(100);
    expect(screen.queryByRole('button', { name: 'Rename' })).toBeNull();
    await user.clear(nameInput());
    await user.type(nameInput(), '  Nightly backup  ');
    await user.click(button('Save name'));
    await waitFor(() => expect(heading()).toBe('Nightly backup'));
    expect(server.requests.find((request) => request.method === 'POST')).toMatchObject({
      path: `/api/v3/checks/${UUID}`, contentType: 'text/plain', body: { name: 'Nightly backup' },
    });
    expect(facts()).toContain('Name Nightly backup Rename');
    expect(document.querySelector('.name-input')).toBeNull();
  });

  it('Cancel (or Escape) keeps the name; an empty or unchanged name saves nothing', async () => {
    const server = fakeServer([project()]);
    const { user } = open();
    await loaded();
    await user.click(button('Rename'));
    await user.type(nameInput(), ' changed');
    await user.click(button('Cancel'));
    expect(document.querySelector('.name-input')).toBeNull();

    await user.click(button('Rename'));
    await user.type(nameInput(), '{Escape}');
    expect(document.querySelector('.name-input')).toBeNull();

    await user.click(button('Rename'));
    await user.clear(nameInput());
    expect((button('Save name') as HTMLButtonElement).disabled).toBe(true);
    await user.type(nameInput(), 'backup-server{Enter}'); // unchanged
    expect(document.querySelector('.name-input')).toBeNull();
    expect(server.writes()).toEqual([]);
    expect(heading()).toBe('backup-server');
  });

  it('shows an error and keeps the form when saving fails', async () => {
    const server = fakeServer([project()]);
    server.fail(new RegExp(`POST /api/v3/checks/${UUID}$`), 503);
    const { user } = open();
    await loaded();
    await user.click(button('Rename'));
    await user.type(nameInput(), '!');
    await user.click(button('Save name'));
    expect(text(await screen.findByRole('alert'))).toBe('Healthchecks.io is temporarily unavailable.');
    expect(nameInput().value).toBe('backup-server!');
  });
});

describe('tag editor', () => {
  const chips = () => [...document.querySelectorAll('.tag-input .tag-chip')].map((chip) => chip.firstChild?.textContent);
  const input = () => screen.getByRole('textbox', { name: 'New tag' });
  const startEditing = async () => {
    await loaded();
    fireEvent.click(button('Edit tags'));
    await waitFor(() => expect(document.querySelectorAll('.tag-suggestion').length).toBeGreaterThan(0));
  };

  it('starts from the current tags and suggests the project\'s other tags', async () => {
    fakeServer([project()]);
    open();
    await startEditing();
    expect(chips()).toEqual(['home', 'nas']);
    expect([...document.querySelectorAll('.tag-suggestion')].map((button) => button.textContent)).toEqual(['+ pi', '+ prod']);
    expect(screen.queryByRole('button', { name: 'Edit tags' })).toBeNull();
  });

  it('adds, removes and saves tags to healthchecks.io as a text/plain JSON body', async () => {
    const server = fakeServer([project()]);
    const { user } = open();
    await startEditing();
    await user.click(button('Remove tag home'));
    await user.type(input(), 'backups ');
    await user.type(input(), 'x,y,');
    await user.type(input(), 'nas '); // duplicate: ignored
    await user.click(button('+ prod'));
    expect(chips()).toEqual(['nas', 'backups', 'x', 'y', 'prod']);
    await user.type(input(), '{Backspace}'); // empty input: removes the last tag
    expect(chips()).toEqual(['nas', 'backups', 'x', 'y']);

    await user.click(button('Save tags'));
    await waitFor(() => expect(document.querySelector('.tag-editor')).toBeNull());
    const save = server.requests.find((request) => request.method === 'POST')!;
    expect(save).toMatchObject({ path: `/api/v3/checks/${UUID}`, contentType: 'text/plain', body: { tags: 'nas backups x y' } });
    await waitFor(() => expect(facts()).toContain('Tags nas backups x y Edit tags'));
  });

  it('includes a half-typed tag when saving', async () => {
    const server = fakeServer([project()]);
    const { user } = open();
    await startEditing();
    await user.type(input(), 'later');
    await user.click(button('Save tags'));
    await waitFor(() => expect(server.writes()).toHaveLength(1));
    expect(server.requests.find((request) => request.method === 'POST')!.body).toEqual({ tags: 'home nas later' });
  });

  it('keeps both changes when a remove and an add happen before a re-render', async () => {
    const server = fakeServer([project()]);
    open();
    await startEditing();
    act(() => {
      fireEvent.click(button('Remove tag home'));
      fireEvent.click(button('+ pi'));
    });
    expect(chips()).toEqual(['nas', 'pi']);
    fireEvent.click(button('Save tags'));
    await waitFor(() => expect(server.writes()).toHaveLength(1));
    expect(server.requests.find((request) => request.method === 'POST')!.body).toEqual({ tags: 'nas pi' });
  });

  it('Cancel discards changes without saving', async () => {
    const server = fakeServer([project()]);
    const { user } = open();
    await startEditing();
    await user.click(button('Remove tag home'));
    await user.click(button('Cancel'));
    expect(document.querySelector('.tag-editor')).toBeNull();
    expect(facts()).toContain('Tags home nas Edit tags');
    expect(server.writes()).toEqual([]);
  });

  it('keeps the editor open with an error if saving fails', async () => {
    const server = fakeServer([project()]);
    server.fail(new RegExp(`POST /api/v3/checks/${UUID}$`), 403);
    const { user } = open();
    await startEditing();
    await user.click(button('Save tags'));
    expect(text(await screen.findByRole('alert'))).toBe('This API key is not allowed to do that (read-only key?).');
    expect(document.querySelector('.tag-editor')).not.toBeNull();
    expect(button('Save tags')).toHaveProperty('disabled', false);
  });
});
