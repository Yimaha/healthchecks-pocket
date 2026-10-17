// "Is there a newer version?" Releases are published on GitHub; the app asks
// GitHub's API for the latest one at most once a day (if the user hasn't
// turned it off). Nothing about the user or their checks is sent.

export const RELEASES_API = 'https://api.github.com/repos/Yimaha/healthchecks-pocket/releases/latest';
export const CHECK_EVERY_MS = 24 * 3600_000;

export interface Release {
  version: string; // "0.4.0"
  url: string; // its page on GitHub, where the APK is
}

export async function latestRelease(): Promise<Release> {
  const response = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
  const { tag_name: releaseTag } = (await response.json()) as { tag_name?: unknown };
  // Only "v1.2.3": the prompt shows the version, and the release page's URL is built from it.
  const releaseVersion = typeof releaseTag === 'string' && /^v(?<releaseVersion>\d+\.\d+\.\d+)$/.exec(releaseTag)?.groups?.releaseVersion;
  if (!releaseVersion) throw new Error('Unexpected answer from GitHub');
  // Built here, not taken from GitHub's html_url, so Download only ever opens this repo's release page.
  return { version: releaseVersion, url: `https://github.com/Yimaha/healthchecks-pocket/releases/tag/v${releaseVersion}` };
}

/** Compare "1.2.3" versions: negative if a is older. A pre-release
 *  ("1.2.3-beta") is older than its release. */
export function compareVersions(first: string, second: string): number {
  const parse = (version: string) => {
    const [core, prerelease] = version.replace(/^v/, '').split('-', 2);
    return { numbers: core.split('.').map((part) => parseInt(part, 10) || 0), isPrerelease: prerelease !== undefined };
  };
  const firstParts = parse(first);
  const secondParts = parse(second);
  for (let i = 0; i < 3; i++) {
    const difference = (firstParts.numbers[i] ?? 0) - (secondParts.numbers[i] ?? 0);
    if (difference) return difference;
  }
  return Number(secondParts.isPrerelease) - Number(firstParts.isPrerelease);
}

/** Offer `latest` if it's newer than this build and than any version the
 *  user skipped. */
export function shouldOffer(current: string, latest: string, skipped: string | null): boolean {
  return compareVersions(latest, current) > 0 && (!skipped || compareVersions(latest, skipped) > 0);
}

export function checkIsDue(lastCheck: number | null, now: number): boolean {
  // A last check "in the future" means the clock was changed: check again.
  return lastCheck === null || now - lastCheck >= CHECK_EVERY_MS || now < lastCheck;
}
