// "Is there a newer version?" Releases are published on GitHub; the app asks
// GitHub's API for the latest one at most once a day (if the user hasn't
// turned it off). Nothing about the user or their checks is sent.

export const RELEASES_API = 'https://api.github.com/repos/Yimaha/healthchecks-pocket/releases/latest'
export const CHECK_EVERY_MS = 24 * 3600_000

export interface Release {
  version: string // "0.4.0"
  url: string // its page on GitHub, where the APK is
}

export async function latestRelease(): Promise<Release> {
  const res = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } })
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
  const body = (await res.json()) as { tag_name?: unknown; html_url?: unknown }
  if (typeof body.tag_name !== 'string' || typeof body.html_url !== 'string') throw new Error('Unexpected answer from GitHub')
  return { version: body.tag_name.replace(/^v/, ''), url: body.html_url }
}

/** Compare "1.2.3" versions: negative if a is older. A pre-release
 *  ("1.2.3-beta") is older than its release. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core, pre] = v.replace(/^v/, '').split('-', 2)
    return { nums: core.split('.').map((n) => parseInt(n, 10) || 0), pre: pre !== undefined }
  }
  const x = parse(a)
  const y = parse(b)
  for (let i = 0; i < 3; i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0)
    if (d) return d
  }
  return Number(y.pre) - Number(x.pre)
}

/** Offer `latest` if it's newer than this build and than any version the
 *  user skipped. */
export function shouldOffer(current: string, latest: string, skipped: string | null): boolean {
  return compareVersions(latest, current) > 0 && (!skipped || compareVersions(latest, skipped) > 0)
}

export function checkIsDue(lastCheck: number | null, now: number): boolean {
  // A last check "in the future" means the clock was changed: check again.
  return lastCheck === null || now - lastCheck >= CHECK_EVERY_MS || now < lastCheck
}
