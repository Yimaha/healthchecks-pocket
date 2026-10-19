import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_VERSION } from '../../src/core/app';
import { checkIsDue, compareVersions, latestRelease, RELEASES_API, shouldOffer } from '../../src/core/updates';

describe('versions', () => {
  it('the app knows its version, from package.json', () => {
    expect(APP_VERSION).toBe(JSON.parse(readFileSync('package.json', 'utf8')).version);
  });

  it.each([
    ['0.3.0', '0.4.0', -1], ['0.10.0', '0.9.9', 1], ['1.0.0', '1.0.0', 0], ['v1.2.3', '1.2.3', 0],
    ['1.0.0-beta.1', '1.0.0', -1], ['1.0.1-beta', '1.0.0', 1], ['2.0', '2.0.0', 0],
  ])('%s vs %s', (first, second, sign) => expect(Math.sign(compareVersions(first, second))).toBe(sign));

  it('offers a newer version, unless it\'s the skipped one or older than it', () => {
    expect(shouldOffer('0.3.0', '0.4.0', null)).toBe(true);
    expect(shouldOffer('0.3.0', '0.3.0', null)).toBe(false);
    expect(shouldOffer('0.4.0', '0.3.0', null)).toBe(false);
    expect(shouldOffer('0.3.0', '0.4.0', '0.4.0')).toBe(false); // skipped
    expect(shouldOffer('0.3.0', '0.4.1', '0.4.0')).toBe(true); // newer than the skipped one
    expect(shouldOffer('0.3.0', '0.4.0', '0.5.0')).toBe(false);
  });

  it('checks at most once a day', () => {
    const now = Date.parse('2026-10-12T12:00:00Z');
    const HOUR = 3600_000;
    expect(checkIsDue(null, now)).toBe(true);
    expect(checkIsDue(now - 23 * HOUR, now)).toBe(false);
    expect(checkIsDue(now - 24 * HOUR, now)).toBe(true);
    expect(checkIsDue(now + 5 * HOUR, now)).toBe(true); // the clock was changed
  });
});

describe('latestRelease', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the latest release from GitHub, without credentials', async () => {
    const fetch = vi.fn(async () => Response.json({ tag_name: 'v0.4.0', html_url: 'https://github.com/Yimaha/healthchecks-pocket/releases/tag/v0.4.0' }));
    vi.stubGlobal('fetch', fetch);
    expect(await latestRelease()).toEqual({ version: '0.4.0', url: 'https://github.com/Yimaha/healthchecks-pocket/releases/tag/v0.4.0' });
    expect(fetch).toHaveBeenCalledWith(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' }, signal: expect.any(AbortSignal) });
    expect(RELEASES_API).toBe('https://api.github.com/repos/Yimaha/healthchecks-pocket/releases/latest');
  });

  it('links to this repo\'s release page, never to the html_url in GitHub\'s answer', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ tag_name: 'v0.4.0', html_url: 'https://evil.example/install-this.apk' }));
    expect((await latestRelease()).url).toBe('https://github.com/Yimaha/healthchecks-pocket/releases/tag/v0.4.0');
  });

  it.each([
    '0.4.0', // no "v"
    'v0.4',
    'v0.4.0-beta.1',
    'v0.4.0/../../../../evil/repo', // in the page's URL, this would lead out of this repo's releases
    'v99.0.0 (uninstall this app, then install the APK from evil.example)', // the prompt shows the version
  ])('refuses the tag %j: a release tag is "v" and three numbers', async (releaseTag) => {
    // The html_url GitHub would send with it, so the tag is all that's wrong.
    const htmlUrl = `https://github.com/Yimaha/healthchecks-pocket/releases/tag/${releaseTag}`;
    vi.stubGlobal('fetch', async () => Response.json({ tag_name: releaseTag, html_url: htmlUrl }));
    await expect(latestRelease()).rejects.toThrow('Unexpected answer from GitHub');
  });

  it('fails on an error or an unexpected answer', async () => {
    vi.stubGlobal('fetch', async () => new Response('rate limited', { status: 403 }));
    await expect(latestRelease()).rejects.toThrow('GitHub answered 403');
    vi.stubGlobal('fetch', async () => Response.json({ message: 'Not Found' }));
    await expect(latestRelease()).rejects.toThrow('Unexpected answer from GitHub');
  });
});
