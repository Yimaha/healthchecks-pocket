import { describe, expect, it, vi } from 'vitest';
import { demoApi } from '../../src/core/demo';
import { findLinks } from '../../src/core/pingBody';
import { offsetLabel, resolveTimeZone, SYSTEM_TZ, systemTimeZone, timeZoneOptions } from '../../src/core/timezones';
import { href, parseRoute, type Route } from '../../src/ui/routes';

describe('demo project', () => {
  it('has a check in every status', async () => {
    const statuses = new Set((await demoApi.listChecks()).map((check) => check.status));
    expect([...statuses].sort()).toEqual(['down', 'grace', 'new', 'paused', 'up']);
  });

  it('keeps its timestamps fixed between refreshes (they age like real data)', async () => {
    const first = (await demoApi.listChecks()).map((check) => check.last_ping);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((await demoApi.listChecks()).map((check) => check.last_ping)).toEqual(first);
  });

  it('mirrors the server: pause keeps last ping, resume resets to New and clears it', async () => {
    const id = 'demo-0001';
    const before = await demoApi.getCheck(id);
    const paused = await demoApi.pause(id);
    expect(paused).toMatchObject({ status: 'paused', last_ping: before.last_ping });
    const resumed = await demoApi.resume(id);
    expect(resumed).toMatchObject({ status: 'new', last_ping: null, next_ping: null });
    expect((await demoApi.pause(id)).last_ping).toBeNull(); // still cleared after pausing again
  });

  it('saves renames', async () => {
    await demoApi.updateCheck('demo-0006', { name: 'Disk partition canary' });
    expect((await demoApi.getCheck('demo-0006')).name).toBe('Disk partition canary');
    expect((await demoApi.listChecks()).find((check) => check.uuid === 'demo-0006')!.name).toBe('Disk partition canary');
  });

  it('saves tag edits', async () => {
    await demoApi.updateCheck('demo-0004', { tags: 'web prod' });
    expect((await demoApi.getCheck('demo-0004')).tags).toBe('web prod');
  });

  it('has a ping body with every log level', async () => {
    const pings = await demoApi.listPings('demo-0001');
    const bodies = await Promise.all(pings.map((ping) => demoApi.pingBody('demo-0001', ping.n)));
    const all = bodies.join('\n');
    for (const level of ['[ERROR]', '[WARN]', '[INFO]', '[DEBUG]']) expect(all).toContain(level);
  });

  it('has a ping body longer than the ping page shows (10,000 characters), to see it cut', async () => {
    expect((await demoApi.pingBody('demo-0001', 407))!.length).toBeGreaterThan(10_000);
  });

  it('has a link in its success and failure bodies, to try opening one', async () => {
    for (const pingNumber of [412, 409]) {
      const urls = (await demoApi.pingBody('demo-0001', pingNumber))!.split('\n').flatMap(findLinks).map((link) => link.info.url);
      expect(urls, `ping #${pingNumber}`).toEqual(['https://example.com/backups/nightly.log']);
    }
  });
});

describe('routes', () => {
  const routes: Route[] = [
    { name: 'list' },
    { name: 'check', id: 'abc-123' },
    { name: 'ping', id: 'abc-123', pingNumber: 27 },
    { name: 'icon', id: 'abc-123' },
    { name: 'settings' },
    { name: 'project', projectId: 'p1' },
    { name: 'addProject' },
    { name: 'risky' },
  ];
  it.each(routes)('round-trips %o', (route) => expect(parseRoute(href(route))).toEqual(route));

  it('encodes ids', () => {
    expect(href({ name: 'check', id: 'a b/c' })).toBe('#/check/a%20b%2Fc');
    expect(parseRoute('#/check/a%20b%2Fc')).toEqual({ name: 'check', id: 'a b/c' });
  });

  it('treats anything unknown as the check list', () => {
    for (const hash of ['', '#', '#/', '#/nope', '#/check']) expect(parseRoute(hash)).toEqual({ name: 'list' });
  });
});

describe('time zones', () => {
  const options = timeZoneOptions();

  it('lists the device zone first, marked as the default', () => {
    expect(options[0].value).toBe(SYSTEM_TZ);
    expect(options[0].label).toContain(systemTimeZone().replace(/_/g, ' '));
    expect(options[0].label).toMatch(/, default$/);
  });

  it('lists UTC right after the default, then every zone once', () => {
    if (systemTimeZone() !== 'UTC') expect(options[1]).toEqual({ value: 'UTC', label: 'UTC' });
    expect(options.length).toBeGreaterThan(300);
    expect(new Set(options.map((option) => option.value)).size).toBe(options.length);
    expect(options.filter((option) => option.value === 'UTC')).toHaveLength(systemTimeZone() === 'UTC' ? 0 : 1);
  });

  it('shows each zone\'s current offset', () => {
    const at = new Date('2026-01-15T12:00:00Z');
    expect(offsetLabel('UTC', at)).toBe('UTC');
    expect(offsetLabel('Asia/Kolkata', at)).toBe('UTC+5:30');
    expect(offsetLabel('America/New_York', at)).toBe('UTC-5');
    expect(offsetLabel('Not/AZone', at)).toBe('');
  });

  it('shows UTC as "UTC" whichever way the ICU version writes it ("GMT" or "GMT+0")', () => {
    for (const written of ['GMT', 'GMT+0', 'GMT-0', 'GMT+0:00']) {
      const spy = vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts')
        .mockReturnValue([{ type: 'timeZoneName', value: written }]);
      expect(offsetLabel('UTC'), written).toBe('UTC');
      spy.mockRestore();
    }
  });

  it('resolves "system" to the device zone and passes others through', () => {
    expect(resolveTimeZone(SYSTEM_TZ)).toBe(systemTimeZone());
    expect(resolveTimeZone('Asia/Tokyo')).toBe('Asia/Tokyo');
  });
});
