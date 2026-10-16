import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { linkify } from '../../src/core/format';
import { platform } from '../../src/platform';
import { check, failBody, UUID } from '../fixtures/healthchecks';
import { fakeServer, startApp, text } from '../helpers';

// The real linkify, counted, to see how often the body is parsed.
vi.mock('../../src/core/format', async (importOriginal) => {
  const actualFormat = await importOriginal<typeof import('../../src/core/format')>();
  return { ...actualFormat, linkify: vi.fn(actualFormat.linkify) };
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

  it('goes back to the check', async () => {
    fakeServer([{ key: 'key-home', checks: [check], bodies: {} }]);
    open(1);
    expect((await screen.findByRole('link', { name: 'Back' })).getAttribute('href')).toBe(`#/check/${UUID}`);
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
    while (!button('Smaller text').disabled) await user.click(button('Smaller text'));
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

  it('parses the body once, not again on every pinch-zoom frame', async () => {
    await openBody();
    const linkifyCallsAfterOpening = vi.mocked(linkify).mock.calls.length;
    expect(linkifyCallsAfterOpening).toBeGreaterThan(0); // the body is parsed through linkify, or this test proves nothing
    const touches = (gap: number) => ({ touches: [{ clientX: 100, clientY: 100 }, { clientX: 100 + gap, clientY: 100 }] });
    fireEvent.touchStart(logBody(), touches(100));
    fireEvent.touchMove(logBody(), touches(150));
    fireEvent.touchMove(logBody(), touches(200));
    expect(logBody().style.fontSize).toBe('26px'); // re-rendered at each frame
    expect(vi.mocked(linkify).mock.calls.length).toBe(linkifyCallsAfterOpening);
  });

  it('shows only the first 10,000 characters of a longer body, as plain text, and says so', async () => {
    const longBody = `[ERROR] https://example.com/log\n${'x'.repeat(20_000)}`;
    const copy = vi.spyOn(platform, 'copyText').mockResolvedValue();
    const linkifyCallsBefore = vi.mocked(linkify).mock.calls.length;
    const { user } = await openBody(longBody);
    expect(text(screen.getByRole('note'))).toContain('Body too long: showing the first 10,000 of 20,032 characters.');
    expect(logBody().textContent).toBe(`${longBody.slice(0, 10_000)}\n...\nBody is trimmed as it's too long.`);
    expect(lines()).toEqual([]); // not split into highlighted lines
    expect(logBody().querySelector('a')).toBeNull();
    expect(vi.mocked(linkify).mock.calls.length).toBe(linkifyCallsBefore);
    await user.click(button('Copy'));
    expect(copy).toHaveBeenCalledWith(longBody);
  });

  it('shows a body of exactly 10,000 characters whole, highlighted', async () => {
    const body = `[ERROR] ${'x'.repeat(9_992)}`;
    await openBody(body);
    expect(screen.queryByRole('note')).toBeNull();
    expect(lines()).toEqual([['error', body]]);
  });

  it('has only text size and Wrap; Wrap off scrolls long lines sideways', async () => {
    const { user } = await openBody();
    expect([...screen.getByRole('toolbar').querySelectorAll('button')].map((button) => button.getAttribute('aria-label') ?? button.textContent))
      .toEqual(['Smaller text', 'Larger text', 'Wrap']);
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
