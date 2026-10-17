import { findAll } from 'highlight-words-core';
import { describe, expect, it } from 'vitest';
import {
  dateTime, duration, durationShort, lineLevel, linkify, percentText, pinchSize, relative, scheduleText, snapSize, sortChecks,
  tagList, uptime, type LinePart,
} from '../../src/core/format';
import { check, NOW } from '../fixtures/healthchecks';

describe('duration (ticking labels)', () => {
  it.each([
    [0, '0s'], [5, '5s'], [59, '59s'], [60, '1m 00s'], [65, '1m 05s'], [3599, '59m 59s'],
    [3600, '1h 00m'], [3660, '1h 01m'], [86399, '23h 59m'], [93600, '1d 02h'],
  ])('%s s -> %s', (seconds, out) => expect(duration(seconds)).toBe(out));

  it('zero-pads the second unit so a ticking label keeps its width', () => {
    const widths = [61, 69, 70, 125, 599].map((seconds) => duration(seconds).length);
    expect(new Set(widths).size).toBe(1);
  });

  it('treats negative input as zero', () => expect(duration(-5)).toBe('0s'));
});

describe('durationShort (fixed values)', () => {
  it.each([
    [3.2, '3s'], [60, '1m'], [1800, '30m'], [3600, '1h'], [5400, '1h 30m'], [3660, '1h 1m'], [86400, '1d'], [604800, '7d'],
  ])('%s s -> %s', (seconds, out) => expect(durationShort(seconds)).toBe(out));
});

describe('relative', () => {
  it('describes past and future times', () => {
    expect(relative(new Date(NOW - 125_000).toISOString(), NOW)).toBe('2m 05s ago');
    expect(relative(new Date(NOW + 3_600_000).toISOString(), NOW)).toBe('in 1h 00m');
  });
  it('says "just now" within 30 seconds', () => expect(relative(new Date(NOW - 10_000).toISOString(), NOW)).toBe('just now'));
  it('says "never" without a timestamp', () => expect(relative(null, NOW)).toBe('never'));
});

describe('dateTime', () => {
  const timestamp = '2026-10-11T19:55:02Z';
  it('formats in the requested time zone', () => {
    expect(dateTime(timestamp, 'UTC')).toContain('07:55:02');
    expect(dateTime(timestamp, 'Asia/Tokyo')).toContain('04:55:02');
  });
  it('can name the zone', () => expect(dateTime(timestamp, 'UTC', true)).toMatch(/UTC$/));
});

describe('scheduleText', () => {
  it('describes a simple period', () => expect(scheduleText(check)).toBe('Every 1h, 1h grace'));
  it('describes a cron schedule with its zone', () =>
    expect(scheduleText({ ...check, schedule: '0 3 * * *', tz: 'Europe/Berlin', grace: 1800 }))
      .toBe('0 3 * * * (Europe/Berlin), 30m grace'));
});

describe('sortChecks', () => {
  it('puts down, then late, then new, up and paused; alphabetical within a status', () => {
    const makeCheck = (name: string, status: typeof check.status) => ({ ...check, name, status });
    const sorted = sortChecks([makeCheck('b', 'up'), makeCheck('p', 'paused'), makeCheck('a', 'up'), makeCheck('n', 'new'), makeCheck('l', 'grace'), makeCheck('d', 'down')]);
    expect(sorted.map((check) => check.name)).toEqual(['d', 'l', 'n', 'a', 'b', 'p']);
  });
});

describe('tagList', () => {
  it('splits space-delimited tags and drops empties', () =>
    expect(tagList({ ...check, tags: ' home  nas ' })).toEqual(['home', 'nas']));
});

describe('lineLevel (ping body highlighting)', () => {
  it.each([
    ['[ERROR] upload failed', 'error'], ['[FAIL] x', 'error'], ['ERROR: x', 'error'], ['fatal: x', 'error'],
    ['[WARN] disk', 'warn'], ['warning: x', 'warn'], ['level=warn disk almost full', 'warn'],
    ['[INFO] ok', 'info'], ['[ ok ] fine', 'info'], ['INFO: done', 'info'],
    ['[DEBUG] retry', 'debug'], ['trace: x', 'debug'],
    ['== nightly-backup (ran 7m ago)', 'plain'], ['', 'plain'],
    ['  [ERROR] indented', 'error'], ['\tlevel=warn indented', 'warn'], ['ts=1 level=debug msg=x', 'debug'],
    ['note: level=error', 'plain'], // a "word:" prefix decides, as before
  ])('%j -> %s', (line, level) => expect(lineLevel(line)).toBe(level));
});

describe('uptime (last 30 days, from status changes)', () => {
  const HOUR = 3_600_000;
  const DAY = 24 * HOUR;
  const at = (msAgo: number, up: 0 | 1) => ({ timestamp: new Date(NOW - msAgo).toISOString(), up });

  it('is 100% with no changes while up (or in grace), 0% while down', () => {
    expect(uptime([], 'up', NOW)).toEqual({ percent: 100, downSeconds: 0, since: null });
    expect(uptime([], 'grace', NOW)?.percent).toBe(100);
    expect(uptime([], 'down', NOW)).toEqual({ percent: 0, downSeconds: 30 * 86400, since: null });
  });

  it('has nothing to measure for a new or paused check with no changes', () => {
    expect(uptime([], 'new', NOW)).toBeNull();
    expect(uptime([], 'paused', NOW)).toBeNull();
  });

  it('counts the time between going down and coming back up', () => {
    const result = uptime([at(5 * DAY, 0), at(5 * DAY - 3 * HOUR, 1)], 'up', NOW)!;
    expect(result.downSeconds).toBe(3 * 3600);
    expect(result.percent).toBeCloseTo(100 * (1 - 3 / (30 * 24)));
    expect(result.since).toBeNull();
  });

  it('counts a check that is still down up to now', () => {
    expect(uptime([at(2 * HOUR, 0)], 'down', NOW)!.downSeconds).toBe(2 * 3600);
  });

  it('measures from the first "went up" when what came before is unknown', () => {
    const result = uptime([at(3 * DAY, 1), at(2 * HOUR + 5 * 60_000, 0), at(2 * HOUR, 1)], 'up', NOW)!;
    expect(result.since).toBe(new Date(NOW - 3 * DAY).toISOString());
    expect(result.downSeconds).toBe(300);
    expect(result.percent).toBeCloseTo(100 * (1 - 300 / (3 * 86400)));
  });

  it('accepts changes in any order, ignores ones outside the window, and repeated states', () => {
    const flips = [at(1 * HOUR, 1), at(40 * DAY, 0), at(3 * HOUR, 0), at(2 * HOUR, 0)];
    expect(uptime(flips, 'up', NOW)!.downSeconds).toBe(2 * 3600);
  });
});

describe('percentText', () => {
  it.each([
    [100, '100%'], [99.876, '99.87%'], [99.5, '99.5%'], [99.99999, '99.99%'], [12.3, '12.3%'], [0, '0%'], [-1, '0%'],
  ])('%s -> %s', (percent, out) => expect(percentText(percent)).toBe(out));
});

describe('ping body text size', () => {
  it.each([[8, 8], [7, 8], [11, 10], [12.6, 13], [15, 14], [22, 20], [26, 24], [35, 32], [36, 32], [37, 40], [99, 40]])(
    'snapSize(%s) = %s (a tie goes to the smaller)', (px, out) => expect(snapSize(px)).toBe(out),
  );

  it('pinching scales the starting size by the finger distance, within 8-40', () => {
    expect(pinchSize(13, 100, 200)).toBe(26);
    expect(pinchSize(13, 100, 50)).toBe(8);
    expect(pinchSize(20, 100, 1000)).toBe(40);
    expect(pinchSize(13, 0, 50)).toBe(13);
  });
});

describe('linkify', () => {
  const urls = (line: string) => linkify(line).filter((part) => part.kind === 'link').map((link) => link.url);
  const partText = (part: LinePart) => (part.kind === 'link' ? part.url : part.text);

  it.each([
    ['Logs: https://example.com/backups/nightly.log', ['https://example.com/backups/nightly.log']],
    ['see https://example.com/a.', ['https://example.com/a']],
    ['done (https://example.com/x), next', ['https://example.com/x']],
    ['wiki https://en.wikipedia.org/wiki/Cron_(Unix) ok', ['https://en.wikipedia.org/wiki/Cron_(Unix)']],
    ['two: http://a.example/1 and https://b.example/2?x=1&y=2#z!', ['http://a.example/1', 'https://b.example/2?x=1&y=2#z']],
    ['[https://example.com/q]', ['https://example.com/q']],
    ['ftp://example.com, javascript:alert(1), mailto:a@b.c, https://', []],
  ])('%s', (line, expected) => expect(urls(line)).toEqual(expected));

  it('gives the line back unchanged when joined', () => {
    for (const line of ['a https://x.example/b. c', '(http://y.example)', 'plain', '', 'https://z.example/']) {
      expect(linkify(line).map(partText).join('')).toBe(line);
    }
  });

  it('gives the text and links in reading order, text between two links as one part, and no empty text', () => {
    expect(linkify('see https://a.example/x). Also https:///path and https://b.example')).toEqual([
      { kind: 'text', text: 'see ' },
      { kind: 'link', url: 'https://a.example/x' },
      { kind: 'text', text: '). Also https:///path and ' },
      { kind: 'link', url: 'https://b.example' },
    ]);
    expect(linkify('')).toEqual([]);
  });

  it('links only http(s) URLs: no other scheme, and no bare domain', () => {
    expect(urls('mail mailto:a@b.example or a@b.example, //cdn.example/x, see example.com or 10.0.0.5')).toEqual([]);
  });

  it('trims sentence punctuation only from the end of a link', () => {
    expect(urls('https://shop.example/?hello=true,try=false, then retry')).toEqual(['https://shop.example/?hello=true,try=false']);
    expect(urls('https://example.com/a;b:c!d?e=f.g')).toEqual(['https://example.com/a;b:c!d?e=f.g']);
  });

  it('keeps the brackets a link opened, and leaves out the ones around it', () => {
    expect(urls('(see https://ex.com/Cron_(Unix)).')).toEqual(['https://ex.com/Cron_(Unix)']);
    expect(urls('https://ex.com/f(a)(b))).')).toEqual(['https://ex.com/f(a)(b)']);
    expect(urls('(see [https://example.com/a_(b)_[c]].)')).toEqual(['https://example.com/a_(b)_[c]']);
  });

  it('links a URL with an emoji in it, without the punctuation after it', () => {
    expect(urls('https://example.com/😀).')).toEqual(['https://example.com/😀']);
  });
});

// Bodies anyone with a check's ping URL can send: each took seconds before, as the time grew with the square of the length.
describe('ping bodies built to be slow', () => {
  const TIME_BUDGET_MS = 250; // generous for slow CI machines, still far below the old seconds
  /** What work returned, and how long it took. */
  const timed = <Result>(work: () => Result) => {
    const startedAt = performance.now();
    const result = work();
    return { result, milliseconds: performance.now() - startedAt };
  };

  it('a URL followed by 40,000 closing brackets is linked quickly', () => {
    const linking = timed(() => linkify(`http://a${')'.repeat(40_000)}`));
    expect(linking.milliseconds).toBeLessThan(TIME_BUDGET_MS);
    expect(linking.result).toEqual([{ kind: 'link', url: 'http://a' }, { kind: 'text', text: ')'.repeat(40_000) }]);
  });

  it('a line of 100,000 spaces or tabs gets its level quickly', () => {
    const spaces = timed(() => lineLevel(' '.repeat(100_000)));
    expect(spaces.milliseconds).toBeLessThan(TIME_BUDGET_MS);
    expect(spaces.result).toBe('plain');
    const tabsThenLevel = timed(() => lineLevel(`${'\t'.repeat(100_000)}level=warn`));
    expect(tabsThenLevel.milliseconds).toBeLessThan(TIME_BUDGET_MS);
    expect(tabsThenLevel.result).toBe('warn');
  });

  it('the ping body search (highlight-words-core) finds each of 10,000 brackets or tabs quickly', () => {
    for (const character of [')', '\t']) {
      const search = timed(() => findAll({ searchWords: [character], textToHighlight: character.repeat(10_000) }));
      expect(search.milliseconds).toBeLessThan(TIME_BUDGET_MS);
      expect(search.result.filter((chunk) => chunk.highlight)).toHaveLength(10_000);
    }
  });
});
