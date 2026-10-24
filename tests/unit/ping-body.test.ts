import { describe, expect, it } from 'vitest';
import { assembleBody, assembleLine, findLinks, lineLevel, readBody, searchLines, type BodyLine } from '@/core/pingBody';
import type { Span } from '@/core/spans';

/** A piece's match as assembleLine gives it: its number, and whether it goes on into the piece before or after. */
const inMatch = (number: number, joins: { joinsPrevious?: boolean; joinsNext?: boolean } = {}) =>
  ({ number, joinsPrevious: false, joinsNext: false, ...joins });

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

describe('findLinks', () => {
  const urls = (line: string) => findLinks(line).map((link) => link.info.url);

  it.each([
    ['Logs: https://example.com/backups/nightly.log', ['https://example.com/backups/nightly.log']],
    ['see https://example.com/a.', ['https://example.com/a']],
    ['done (https://example.com/x), next', ['https://example.com/x']],
    ['wiki https://en.wikipedia.org/wiki/Cron_(Unix) ok', ['https://en.wikipedia.org/wiki/Cron_(Unix)']],
    ['two: http://a.example/1 and https://b.example/2?x=1&y=2#z!', ['http://a.example/1', 'https://b.example/2?x=1&y=2#z']],
    ['[https://example.com/q]', ['https://example.com/q']],
    ['ftp://example.com, javascript:alert(1), mailto:a@b.c, https://', []],
  ])('%s', (line, expected) => expect(urls(line)).toEqual(expected));

  it('gives the links in reading order, each where its URL is in the line', () => {
    expect(findLinks('see https://a.example/x). Also https:///path and https://b.example')).toEqual([
      { start: 4, end: 23, info: { url: 'https://a.example/x' } },
      { start: 49, end: 66, info: { url: 'https://b.example' } },
    ]);
    for (const line of ['a https://x.example/b. c', '(http://y.example)', 'https://z.example/']) {
      for (const link of findLinks(line)) expect(line.slice(link.start, link.end)).toBe(link.info.url);
    }
    expect(findLinks('')).toEqual([]);
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

describe('readBody', () => {
  it('reads each line of a body: its text as sent, its level and its links', () => {
    expect(readBody('[ERROR] see https://example.com/log\n\nplain')).toEqual({
      isCut: false,
      lines: [
        { text: '[ERROR] see https://example.com/log', level: 'error', links: [{ start: 12, end: 35, info: { url: 'https://example.com/log' } }] },
        { text: '', level: 'plain', links: [] },
        { text: 'plain', level: 'plain', links: [] },
      ],
    });
  });

  it('cuts a body longer than 10,000 characters to that, and reads no levels or links in it', () => {
    const body = `[ERROR] https://example.com/log\n${'x'.repeat(20_000)}`;
    const { isCut, lines } = readBody(body);
    expect(isCut).toBe(true);
    expect(lines.map((line) => line.text).join('\n')).toBe(body.slice(0, 10_000));
    expect(lines[0]).toEqual({ text: '[ERROR] https://example.com/log', level: 'plain', links: [] });
  });

  it('reads a body of exactly 10,000 characters whole', () => {
    const body = `[ERROR] ${'x'.repeat(9_992)}`;
    expect(readBody(body)).toEqual({ isCut: false, lines: [{ text: body, level: 'error', links: [] }] });
  });
});

describe('searchLines', () => {
  const count = (line: string, query: string) => searchLines([line], query).count;

  it('searches each line whole, so a match runs over where a link starts or ends', () => {
    const line = 'see https://example.com/logs now';
    expect(searchLines([line], 'see https').matchesByLine).toEqual([[{ start: 0, end: 9, info: 0 }]]);
    expect(searchLines([line], 'logs now').matchesByLine).toEqual([[{ start: 24, end: 32, info: 0 }]]);
  });

  it('numbers the matches in reading order across the lines, and counts them', () => {
    expect(searchLines(['fail', 'ok', 'FAIL then fail'], 'fail')).toEqual({
      count: 3,
      matchesByLine: [[{ start: 0, end: 4, info: 0 }], [], [{ start: 0, end: 4, info: 1 }, { start: 10, end: 14, info: 2 }]],
    });
  });

  it('never matches from one line into the next', () => {
    expect(searchLines(['ab', 'cd'], 'bc').count).toBe(0);
  });

  it('finds the query in any case, as plain text rather than a pattern, without overlaps', () => {
    expect(count('Error ERROR error', 'error')).toBe(3);
    expect(count('a.b (c)', '.')).toBe(1);
    expect(count('a.b (c)', '(c)')).toBe(1);
    expect(count('aaaa', 'aa')).toBe(2);
  });

  it('finds nothing for no query', () => {
    expect(searchLines(['text'], '')).toEqual({ count: 0, matchesByLine: [[]] });
  });
});

describe('assembleLine', () => {
  // assembleLine's example:
  //
  //   text    "see https://a.example/x now"
  //            0   4    9           21 23   27
  //   link         [4─────────────────────23)        https://a.example/x
  //   match   [0───────9)           [21───────27)    match 0, match 1
  const exampleLine: BodyLine = {
    text: 'see https://a.example/x now',
    level: 'plain',
    links: [{ start: 4, end: 23, info: { url: 'https://a.example/x' } }],
  };
  const exampleMatches: Span<number>[] = [{ start: 0, end: 9, info: 0 }, { start: 21, end: 27, info: 1 }];
  const lineOf = (text: string): BodyLine => ({ text, level: 'plain', links: findLinks(text) });

  it('puts the pieces back together as text and links, each piece with its match and the pieces that match joins', () => {
    expect(assembleLine(exampleLine, exampleMatches)).toEqual([
      { kind: 'text', pieces: [{ text: 'see ', match: inMatch(0, { joinsNext: true }) }] },
      {
        kind: 'link',
        url: 'https://a.example/x',
        pieces: [
          { text: 'https', match: inMatch(0, { joinsPrevious: true }) },
          { text: '://a.example' },
          { text: '/x', match: inMatch(1, { joinsNext: true }) },
        ],
      },
      { kind: 'text', pieces: [{ text: ' now', match: inMatch(1, { joinsPrevious: true }) }] },
    ]);
  });

  it('gives each link its own part, with the text between links as parts of their own', () => {
    expect(assembleLine(lineOf('a https://a.example b https://b.example'), [])).toEqual([
      { kind: 'text', pieces: [{ text: 'a ' }] },
      { kind: 'link', url: 'https://a.example', pieces: [{ text: 'https://a.example' }] },
      { kind: 'text', pieces: [{ text: ' b ' }] },
      { kind: 'link', url: 'https://b.example', pieces: [{ text: 'https://b.example' }] },
    ]);
  });

  it('keeps two links that touch apart, even with the same URL', () => {
    const url = 'https://a.example/x';
    const line: BodyLine = { text: url + url, level: 'plain', links: [{ start: 0, end: 19, info: { url } }, { start: 19, end: 38, info: { url } }] };
    expect(assembleLine(line, [])).toEqual([
      { kind: 'link', url, pieces: [{ text: url }] },
      { kind: 'link', url, pieces: [{ text: url }] },
    ]);
  });

  it('joins only the pieces of one match: a match over a whole link joins both sides, and two matches that touch don\'t', () => {
    const text = 'x https://a.example y';
    expect(assembleLine(lineOf(text), searchLines([text], text).matchesByLine[0])).toEqual([
      { kind: 'text', pieces: [{ text: 'x ', match: inMatch(0, { joinsNext: true }) }] },
      { kind: 'link', url: 'https://a.example', pieces: [{ text: 'https://a.example', match: inMatch(0, { joinsPrevious: true, joinsNext: true }) }] },
      { kind: 'text', pieces: [{ text: ' y', match: inMatch(0, { joinsPrevious: true }) }] },
    ]);
    expect(assembleLine(lineOf('aaaa'), searchLines(['aaaa'], 'aa').matchesByLine[0])).toEqual([
      { kind: 'text', pieces: [{ text: 'aa', match: inMatch(0) }, { text: 'aa', match: inMatch(1) }] },
    ]);
  });

  it('gives a line with no links or matches as one text part, and an empty line as no parts', () => {
    expect(assembleLine(lineOf('plain text'), [])).toEqual([{ kind: 'text', pieces: [{ text: 'plain text' }] }]);
    expect(assembleLine(lineOf(''), [])).toEqual([]);
  });
});

describe('assembleBody', () => {
  const assemble = (body: string, query: string) => {
    const { lines } = readBody(body);
    return assembleBody(lines, searchLines(lines.map((line) => line.text), query));
  };
  const line = 'see https://example.com/logs now';

  it('gives each line its level, and its text as text and links', () => {
    expect(assemble('[ERROR] see https://example.com/log.\nok', '')).toEqual([
      {
        level: 'error',
        parts: [
          { kind: 'text', pieces: [{ text: '[ERROR] see ' }] },
          { kind: 'link', url: 'https://example.com/log', pieces: [{ text: 'https://example.com/log' }] },
          { kind: 'text', pieces: [{ text: '.' }] },
        ],
      },
      { level: 'plain', parts: [{ kind: 'text', pieces: [{ text: 'ok' }] }] },
    ]);
  });

  it('keeps a link one part when a match runs into it, and marks the match on both sides of its edge', () => {
    expect(assemble(line, 'see https')[0].parts).toEqual([
      { kind: 'text', pieces: [{ text: 'see ', match: inMatch(0, { joinsNext: true }) }] },
      {
        kind: 'link',
        url: 'https://example.com/logs',
        pieces: [{ text: 'https', match: inMatch(0, { joinsPrevious: true }) }, { text: '://example.com/logs' }],
      },
      { kind: 'text', pieces: [{ text: ' now' }] },
    ]);
  });

  it('keeps a link one part when a match runs out of it, too', () => {
    expect(assemble(line, 'logs now')[0].parts).toEqual([
      { kind: 'text', pieces: [{ text: 'see ' }] },
      {
        kind: 'link',
        url: 'https://example.com/logs',
        pieces: [{ text: 'https://example.com/' }, { text: 'logs', match: inMatch(0, { joinsNext: true }) }],
      },
      { kind: 'text', pieces: [{ text: ' now', match: inMatch(0, { joinsPrevious: true }) }] },
    ]);
  });

  it('gives each marked piece the number of its match, across lines and links', () => {
    const pieces = assemble('fail\nhttps://fail.example/fail fail', 'fail').flatMap((assembled) => assembled.parts.flatMap((part) => part.pieces));
    expect(pieces.filter((piece) => piece.match !== undefined).map((piece) => piece.match?.number)).toEqual([0, 1, 2, 3]);
  });

  it('gives each line back unchanged when its pieces are joined, and an empty line no parts', () => {
    const body = 'a https://x.example/b. c\n\n(http://y.example) x';
    const lines = assemble(body, 'x');
    expect(lines.map((assembled) => assembled.parts.flatMap((part) => part.pieces).map((piece) => piece.text).join('')).join('\n')).toBe(body);
    expect(lines[1].parts).toEqual([]);
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
    const linking = timed(() => findLinks(`http://a${')'.repeat(40_000)}`));
    expect(linking.milliseconds).toBeLessThan(TIME_BUDGET_MS);
    expect(linking.result).toEqual([{ start: 0, end: 8, info: { url: 'http://a' } }]);
  });

  it('a line of 100,000 spaces or tabs gets its level quickly', () => {
    const spaces = timed(() => lineLevel(' '.repeat(100_000)));
    expect(spaces.milliseconds).toBeLessThan(TIME_BUDGET_MS);
    expect(spaces.result).toBe('plain');
    const tabsThenLevel = timed(() => lineLevel(`${'\t'.repeat(100_000)}level=warn`));
    expect(tabsThenLevel.milliseconds).toBeLessThan(TIME_BUDGET_MS);
    expect(tabsThenLevel.result).toBe('warn');
  });

  it('the search finds each of 10,000 brackets or tabs in a line quickly, and they are assembled quickly', () => {
    for (const character of [')', '\t']) {
      const { lines } = readBody(character.repeat(10_000));
      const search = timed(() => searchLines(lines.map((line) => line.text), character));
      expect(search.milliseconds).toBeLessThan(TIME_BUDGET_MS);
      expect(search.result.count).toBe(10_000);
      const assembling = timed(() => assembleBody(lines, search.result));
      expect(assembling.milliseconds).toBeLessThan(TIME_BUDGET_MS);
      expect(assembling.result[0].parts[0].pieces).toHaveLength(10_000);
    }
  });
});
