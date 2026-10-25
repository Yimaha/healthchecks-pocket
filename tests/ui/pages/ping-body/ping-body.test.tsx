import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readBody } from '@/core/ping-body/pingBody';
import { platform } from '@/platform';
import { check, failBody, readOnlyCheck, UUID } from '../../../fixtures/healthchecks';
import { fakeServer, makeProject, startApp, text } from '../../../helpers';

// The real readBody, counted, to see how often the body is read (split into lines, with their levels and links).
vi.mock('@/core/ping-body/pingBody', async (importOriginal) => {
  const actualPingBody = await importOriginal<typeof import('@/core/ping-body/pingBody')>();
  return { ...actualPingBody, readBody: vi.fn(actualPingBody.readBody) };
});

const open = (pingNumber: number) => startApp({ hash: `#/check/${UUID}/ping/${pingNumber}` });
const lines = () => [...document.querySelectorAll('pre.body .line')].map((line) => [line.className.replace('line line-', ''), line.textContent?.trimEnd()]);

describe('ping body', () => {
  it('shows the body with each line highlighted by its log level', async () => {
    fakeServer([{ key: 'key-home', checks: [check], bodies: { [`${UUID}/27`]: failBody } }]);
    open(27);
    await waitFor(() => expect(lines()).toHaveLength(5));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Ping #27');
    expect(lines()).toEqual([
      ['plain', 'FAIL (1 failing, 0 warnings)'],
      ['error', '[ERROR] backup: upload failed'],
      ['debug', '[DEBUG] retrying (3/3)'],
      ['warn', 'level=warn disk almost full'],
      ['info', 'INFO: done'],
    ]);
  });

  it('keeps the body text exactly as sent', async () => {
    const body = '  indented\n\ttab\n\n== section\n';
    fakeServer([{ key: 'key-home', checks: [check], bodies: { [`${UUID}/3`]: body } }]);
    open(3);
    await waitFor(() => expect(document.querySelector('pre.body')).not.toBeNull());
    expect(document.querySelector('pre.body')!.textContent).toBe(body + '\n');
  });

  it('says when a ping has no body', async () => {
    fakeServer([{ key: 'key-home', checks: [check] }]);
    open(1);
    expect(await screen.findByText('This ping has no body.')).toBeTruthy();
  });

  it('shows errors with Retry', async () => {
    const server = fakeServer([{ key: 'key-home', checks: [check], bodies: { [`${UUID}/2`]: 'ok' } }]);
    server.fail(/body$/, 503);
    open(2);
    expect(text(await screen.findByRole('alert'))).toBe('Healthchecks.io is temporarily unavailable. Retry');
    screen.getByRole('button', { name: 'Retry' }).click();
    await waitFor(() => expect(document.querySelector('pre.body')?.textContent).toBe('ok\n'));
  });

  it('Retry after the check fails to load loads the check, then the body', async () => {
    const server = fakeServer([{ key: 'key-home', checks: [check], bodies: { [`${UUID}/2`]: 'ok' } }]);
    server.fail(new RegExp(`/checks/${UUID}$`), 503);
    open(2);
    expect(text(await screen.findByRole('alert'))).toBe('Healthchecks.io is temporarily unavailable. Retry');
    screen.getByRole('button', { name: 'Retry' }).click();
    await waitFor(() => expect(document.querySelector('pre.body')?.textContent).toBe('ok\n'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('goes back to the check', async () => {
    fakeServer([{ key: 'key-home', checks: [check], bodies: {} }]);
    open(1);
    expect((await screen.findByRole('link', { name: 'Back' })).getAttribute('href')).toBe(`#/check/${UUID}`);
  });
});

describe('with a read-only key', () => {
  it('shows a short warning instead of the body, with the way back to the check', async () => {
    // The app links to no ping of a check without its regular key, but an old link or the history can still lead here.
    const READ_ONLY_KEY = readOnlyCheck.unique_key!;
    const server = fakeServer([{ key: 'key-ro', checks: [readOnlyCheck] }]);
    startApp({ projects: [makeProject({ apiKey: 'key-ro', readOnly: true })], hash: `#/check/${READ_ONLY_KEY}/ping/3` });
    expect(text(await screen.findByRole('note'))).toBe("This project's API key is read-only. To see a ping's body, use a regular key.");
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Ping #3');
    expect(screen.getByRole('link', { name: 'Back' }).getAttribute('href')).toBe(`#/check/${READ_ONLY_KEY}`);
    expect(screen.queryAllByRole('button')).toEqual([]); // no Copy, Share or view tools
    expect(server.count(/pings/)).toBe(0);
  });
});

describe('ping body tools', () => {
  const shareText = platform.shareText;
  afterEach(() => {
    platform.shareText = shareText;
    vi.restoreAllMocks();
  });

  const logBody = () => document.querySelector('pre.body') as HTMLElement;
  const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;
  const openBody = async (body = failBody) => {
    fakeServer([{ key: 'key-home', checks: [check], bodies: { [`${UUID}/27`]: body } }]);
    const app = open(27);
    await waitFor(() => expect(logBody()).not.toBeNull());
    return app;
  };

  it('copies the whole body exactly as sent', async () => {
    const copy = vi.spyOn(platform, 'copyText').mockResolvedValue();
    const { user } = await openBody();
    await user.click(button('Copy'));
    expect(copy).toHaveBeenCalledWith(failBody);
    expect((await screen.findByRole('status')).textContent).toBe('Copied');
  });

  it('says when copying fails', async () => {
    vi.spyOn(platform, 'copyText').mockRejectedValue(new Error('denied'));
    const { user } = await openBody();
    await user.click(button('Copy'));
    expect((await screen.findByRole('status')).textContent).toBe("Couldn't copy");
  });

  it('shares the body with the check name and ping number', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    platform.shareText = share;
    const { user } = await openBody();
    await user.click(button('Share'));
    expect(share).toHaveBeenCalledWith('backup-server · ping #27', failBody);
  });

  it('offers Share only where the system has a share sheet', async () => {
    platform.shareText = null;
    await openBody();
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
    expect(button('Copy').disabled).toBe(false);
  });

  it('has nothing to copy, and no view tools, when a ping has no body', async () => {
    fakeServer([{ key: 'key-home', checks: [check] }]);
    open(1);
    await screen.findByText('This ping has no body.');
    expect(button('Copy').disabled).toBe(true);
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('steps the text size through 8-40px', async () => {
    const { user } = await openBody();
    expect(logBody().style.fontSize).toBe('13px');
    await user.click(button('Larger text'));
    expect(logBody().style.fontSize).toBe('14px');
    expect(screen.getByLabelText('Text size').textContent).toBe('14');
    const seen = [];
    while (!button('Larger text').disabled) {
      await user.click(button('Larger text'));
      seen.push(logBody().style.fontSize);
    }
    expect(seen).toEqual(['16px', '18px', '20px', '24px', '28px', '32px', '40px']);
    while (!button('Smaller text').disabled) {
      await user.click(button('Smaller text'));
    }
    expect(logBody().style.fontSize).toBe('8px');
  });

  it('pinch zooms the text, then settles on the nearest size', async () => {
    await openBody();
    const touches = (gap: number) => ({ touches: [{ clientX: 100, clientY: 100 }, { clientX: 100 + gap, clientY: 100 }] });
    fireEvent.touchStart(logBody(), touches(100));
    fireEvent.touchMove(logBody(), touches(200)); // fingers twice as far apart
    expect(logBody().style.fontSize).toBe('26px');
    fireEvent.touchEnd(logBody(), { touches: [] });
    expect(logBody().style.fontSize).toBe('24px');
    expect(screen.getByLabelText('Text size').textContent).toBe('24');
    expect(localStorage.getItem('healthchecks-pocket.pingBody.size')).toBe('24');
  });

  it('reads the body once, not again on every pinch-zoom frame', async () => {
    await openBody();
    const readsAfterOpening = vi.mocked(readBody).mock.calls.length;
    expect(readsAfterOpening).toBeGreaterThan(0); // the body is read through readBody, or this test proves nothing
    const touches = (gap: number) => ({ touches: [{ clientX: 100, clientY: 100 }, { clientX: 100 + gap, clientY: 100 }] });
    fireEvent.touchStart(logBody(), touches(100));
    fireEvent.touchMove(logBody(), touches(150));
    fireEvent.touchMove(logBody(), touches(200));
    expect(logBody().style.fontSize).toBe('26px'); // re-rendered at each frame
    expect(vi.mocked(readBody).mock.calls.length).toBe(readsAfterOpening);
  });

  it('shows only the first 10,000 characters of a longer body, as plain text, and says so', async () => {
    const longBody = `[ERROR] https://example.com/log\n${'x'.repeat(20_000)}`;
    const copy = vi.spyOn(platform, 'copyText').mockResolvedValue();
    const { user } = await openBody(longBody);
    expect(text(screen.getByRole('note'))).toContain('Body too long: showing the first 10,000 of 20,032 characters.');
    expect(logBody().textContent).toBe(`${longBody.slice(0, 10_000)}\n...\nBody is trimmed as it's too long.`);
    expect(lines()).toEqual([]); // not split into highlighted lines
    expect(logBody().querySelector('a')).toBeNull();
    await user.click(button('Copy'));
    expect(copy).toHaveBeenCalledWith(longBody);
  });

  it('shows a body of exactly 10,000 characters whole, highlighted', async () => {
    const body = `[ERROR] ${'x'.repeat(9_992)}`;
    await openBody(body);
    expect(screen.queryByRole('note')).toBeNull();
    expect(lines()).toEqual([['error', body]]);
  });

  it('has text size, Wrap and Search; Wrap off scrolls long lines sideways', async () => {
    const { user } = await openBody();
    expect([...screen.getByRole('toolbar').querySelectorAll('button')].map((button) => button.getAttribute('aria-label') ?? button.textContent))
      .toEqual(['Smaller text', 'Larger text', 'Wrap', 'Search']);
    expect(logBody().className).toBe('body');
    expect(button('Wrap').getAttribute('aria-pressed')).toBe('true');
    await user.click(button('Wrap'));
    expect(logBody().className).toBe('body body-nowrap');
    expect(button('Wrap').getAttribute('aria-pressed')).toBe('false');
  });

  it('opens links in the browser, and keeps the text as sent', async () => {
    const open = vi.spyOn(platform, 'openExternal').mockImplementation(() => {});
    const body = 'see https://example.com/logs/1. and (https://hc.example.org/x)\nno link here';
    const { user } = await openBody(body);
    const links = screen.getAllByRole('link').filter((link) => link.classList.contains('body-link'));
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['https://example.com/logs/1', 'https://hc.example.org/x']);
    await user.click(links[0]);
    expect(open).toHaveBeenCalledWith('https://example.com/logs/1');
    expect(logBody().textContent).toBe(body + '\n');
  });

  describe('search', () => {
    const searchField = () => screen.getByRole('searchbox', { name: 'Search the body' }) as HTMLInputElement;
    const matchCount = () => screen.getByRole('status').textContent;
    const marks = () => [...logBody().querySelectorAll('mark')].map((mark) => [mark.className, mark.textContent]);
    /** The count, and the level of the line the current match is on. */
    const currentMatch = () => [matchCount(), logBody().querySelector('.body-match-current')?.closest('.line')?.className];
    const openSearch = async (body?: string) => {
      const app = await openBody(body);
      await app.user.click(button('Search'));
      return app;
    };

    it('is closed until its button opens it, then highlights matches as you type, in any case, and counts them', async () => {
      const { user } = await openBody();
      expect(screen.queryByRole('searchbox')).toBeNull();
      await user.click(button('Search'));
      expect(button('Search').getAttribute('aria-pressed')).toBe('true');
      expect(document.activeElement).toBe(searchField());
      await user.type(searchField(), 'FAIL');
      expect(matchCount()).toBe('1 of 3');
      expect(marks()).toEqual([['body-match body-match-current', 'FAIL'], ['body-match', 'fail'], ['body-match', 'fail']]);
      // Marked inside their lines, which keep their level, and the text stays as sent.
      expect(logBody().querySelector('.line-error mark')?.textContent).toBe('fail');
      expect(lines().map(([level]) => level)).toEqual(['plain', 'error', 'debug', 'warn', 'info']);
      expect(logBody().textContent).toBe(failBody + '\n');
    });

    it('steps with Next and Previous, or Enter and Shift+Enter, round from the last match to the first', async () => {
      const { user } = await openSearch();
      await user.type(searchField(), 'fail');
      expect(currentMatch()).toEqual(['1 of 3', 'line line-plain']);
      await user.click(button('Next match'));
      expect(currentMatch()).toEqual(['2 of 3', 'line line-plain']);
      await user.type(searchField(), '{Enter}');
      expect(currentMatch()).toEqual(['3 of 3', 'line line-error']);
      await user.keyboard('{Enter}');
      expect(currentMatch()).toEqual(['1 of 3', 'line line-plain']);
      await user.keyboard('{Shift>}{Enter}{/Shift}');
      expect(currentMatch()).toEqual(['3 of 3', 'line line-error']);
      await user.click(button('Previous match'));
      expect(currentMatch()).toEqual(['2 of 3', 'line line-plain']);
    });

    it('scrolls the current match into view, centred both ways', async () => {
      const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView');
      const { user } = await openSearch();
      await user.type(searchField(), 'fail');
      await user.click(button('Previous match'));
      expect(scrollIntoView.mock.contexts.at(-1)).toBe(logBody().querySelector('.line-error .body-match-current'));
      expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'center', inline: 'center' });
    });

    it('says when nothing matches; clearing or closing the search takes the highlights away', async () => {
      const { user } = await openSearch();
      await user.type(searchField(), 'nowhere');
      expect(matchCount()).toBe('No matches');
      expect(marks()).toEqual([]);
      expect([button('Previous match').disabled, button('Next match').disabled]).toEqual([true, true]);
      await user.clear(searchField());
      await user.type(searchField(), 'done');
      expect(marks()).toHaveLength(1);
      await user.clear(searchField());
      expect(matchCount()).toBe('');
      expect(marks()).toEqual([]);
      await user.type(searchField(), 'done');
      await user.click(button('Search'));
      expect(screen.queryByRole('searchbox')).toBeNull();
      expect(marks()).toEqual([]);
      await user.click(button('Search'));
      expect(searchField().value).toBe('');
    });

    it('marks matches in links too, and the links still open', async () => {
      const openExternal = vi.spyOn(platform, 'openExternal').mockImplementation(() => {});
      const { user } = await openSearch('logs: https://example.com/logs and https://example.com/more');
      await user.type(searchField(), 'LOGS');
      expect(matchCount()).toBe('1 of 2');
      expect(marks()).toEqual([['body-match body-match-current', 'logs'], ['body-match', 'logs']]);
      expect(logBody().querySelector('a mark')?.textContent).toBe('logs');
      await user.click(logBody().querySelector('a mark')!);
      expect(openExternal).toHaveBeenCalledWith('https://example.com/logs');
    });

    it('finds a match that runs into a link or out of it, counted once, and the link stays one link', async () => {
      const openExternal = vi.spyOn(platform, 'openExternal').mockImplementation(() => {});
      const body = 'see https://example.com/logs now\nsee https later';
      const { user } = await openSearch(body);
      await user.type(searchField(), 'see https');
      expect(matchCount()).toBe('1 of 2');
      // One match, as a mark on each side of the link's edge: both current, each joining the other.
      expect(marks()).toEqual([
        ['body-match body-match-current body-match-joins-next', 'see '],
        ['body-match body-match-current body-match-joins-previous', 'https'],
        ['body-match', 'see https'],
      ]);
      await user.click(button('Next match'));
      expect(matchCount()).toBe('2 of 2');
      expect(marks()).toEqual([
        ['body-match body-match-joins-next', 'see '],
        ['body-match body-match-joins-previous', 'https'],
        ['body-match body-match-current', 'see https'],
      ]);
      await user.clear(searchField());
      await user.type(searchField(), 'logs now');
      expect(matchCount()).toBe('1 of 1');
      expect(marks()).toEqual([['body-match body-match-current body-match-joins-next', 'logs'], ['body-match body-match-current body-match-joins-previous', ' now']]);
      const links = [...logBody().querySelectorAll('a')];
      expect(links.map((link) => [link.getAttribute('href'), link.textContent])).toEqual([['https://example.com/logs', 'https://example.com/logs']]);
      await user.click(links[0].querySelector('mark')!);
      expect(openExternal).toHaveBeenCalledWith('https://example.com/logs');
      expect(logBody().textContent).toBe(body + '\n');
    });

    it('doesn\'t read the body again as you type, and text size and pinch to zoom still work', async () => {
      const { user } = await openSearch();
      const readsAfterOpening = vi.mocked(readBody).mock.calls.length;
      await user.type(searchField(), 'fail');
      await user.click(button('Next match'));
      await user.click(button('Larger text'));
      expect(logBody().style.fontSize).toBe('14px');
      const touches = (gap: number) => ({ touches: [{ clientX: 100, clientY: 100 }, { clientX: 100 + gap, clientY: 100 }] });
      fireEvent.touchStart(logBody(), touches(100));
      fireEvent.touchMove(logBody(), touches(200));
      expect(logBody().style.fontSize).toBe('28px');
      expect(currentMatch()).toEqual(['2 of 3', 'line line-plain']);
      expect(vi.mocked(readBody).mock.calls.length).toBe(readsAfterOpening);
    });

    it('searches only the part shown of a body too long to show whole, and says so', async () => {
      const copy = vi.spyOn(platform, 'copyText').mockResolvedValue();
      // The second "needle" starts before the cut but ends after it, so it isn't one.
      const longBody = `${'x'.repeat(9_990)} needle ${'needle '.repeat(100)}`;
      const { user } = await openSearch(longBody);
      expect(screen.getByText(/^Searches only/).textContent).toBe("Searches only the 10,000 characters shown: matches after them aren't counted.");
      await user.type(searchField(), 'needle');
      expect(matchCount()).toBe('1 of 1');
      expect(marks()).toEqual([['body-match body-match-current', 'needle']]);
      await user.clear(searchField());
      await user.type(searchField(), 'trimmed'); // the note under the cut body isn't part of it
      expect(matchCount()).toBe('No matches');
      await user.click(button('Copy'));
      expect(copy).toHaveBeenCalledWith(longBody);
    });
  });

  it('remembers the view settings for the next ping', async () => {
    const { user, unmount } = await openBody();
    await user.click(button('Larger text'));
    await user.click(button('Wrap'));
    unmount();
    await openBody('other');
    await waitFor(() => expect(logBody().style.fontSize).toBe('14px'));
    expect(logBody().className).toBe('body body-nowrap');
  });

  it('ignores a remembered text size outside the range', async () => {
    localStorage.setItem('healthchecks-pocket.pingBody.size', '99');
    await openBody();
    expect(logBody().style.fontSize).toBe('13px');
  });

  it('snaps a remembered size between steps to the nearest one', async () => {
    localStorage.setItem('healthchecks-pocket.pingBody.size', '23');
    await openBody();
    await waitFor(() => expect(logBody().style.fontSize).toBe('24px'));
  });
});
