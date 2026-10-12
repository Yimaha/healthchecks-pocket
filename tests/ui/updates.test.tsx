import { screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { APP_VERSION } from '../../src/core/app'
import { platform } from '../../src/platform'
import { check } from '../fixtures/healthchecks'
import { fakeServer, startApp, text } from '../helpers'

const GITHUB = 'https://api.github.com/repos/Yimaha/healthchecks-pocket/releases/latest'
const NEWER = '99.0.0'
const releaseUrl = (v: string) => `https://github.com/Yimaha/healthchecks-pocket/releases/tag/v${v}`

/** The fake healthchecks.io server, plus GitHub answering with `latest`
 *  (a version, an HTTP status, or a network failure). */
function servers(latest: string | number | 'offline') {
  fakeServer([{ key: 'key-home', checks: [check] }])
  const healthchecks = globalThis.fetch
  const github = vi.fn(async () => {
    if (latest === 'offline') throw new TypeError('Failed to fetch')
    if (typeof latest === 'number') return new Response('', { status: latest })
    return Response.json({ tag_name: `v${latest}`, html_url: releaseUrl(latest) })
  })
  vi.stubGlobal('fetch', (url: RequestInfo | URL, init?: RequestInit) => (String(url) === GITHUB ? github() : healthchecks(url, init)))
  return github
}

const prompt = () => screen.queryByRole('dialog', { name: 'Update available' })
const listed = () => waitFor(() => expect(document.querySelectorAll('.check-row')).toHaveLength(1))

describe('update check', () => {
  const supported = platform.updatesSupported
  beforeEach(() => {
    platform.updatesSupported = true
  })
  afterEach(() => {
    platform.updatesSupported = supported
  })

  it('offers a newer version on launch; Download opens its release page', async () => {
    const open = vi.spyOn(platform, 'openExternal').mockImplementation(() => {})
    servers(NEWER)
    const { user } = startApp()
    await waitFor(() => expect(prompt()).not.toBeNull())
    expect(text(prompt())).toBe(`Healthchecks Pocket ${NEWER} is available (you have ${APP_VERSION}) Download Skip this version Later`)
    await user.click(screen.getByRole('button', { name: 'Download' }))
    expect(open).toHaveBeenCalledWith(releaseUrl(NEWER))
    expect(prompt()).toBeNull()
  })

  it('Skip this version is remembered; only a newer one is offered again', async () => {
    servers(NEWER)
    const { user, unmount } = startApp()
    await waitFor(() => expect(prompt()).not.toBeNull())
    await user.click(screen.getByRole('button', { name: 'Skip this version' }))
    expect(prompt()).toBeNull()
    expect(localStorage.getItem('healthchecks-pocket.updates.skipped')).toBe(NEWER)
    unmount()

    localStorage.removeItem('healthchecks-pocket.updates.lastCheck') // a day later
    const github = servers(NEWER)
    startApp()
    await listed()
    await waitFor(() => expect(github).toHaveBeenCalled())
    expect(prompt()).toBeNull()

    localStorage.removeItem('healthchecks-pocket.updates.lastCheck')
    servers('99.0.1')
    startApp()
    await waitFor(() => expect(text(prompt())).toContain('Healthchecks Pocket 99.0.1 is available'))
  })

  it('Later hides it without skipping', async () => {
    servers(NEWER)
    const { user } = startApp()
    await waitFor(() => expect(prompt()).not.toBeNull())
    await user.click(screen.getByRole('button', { name: 'Later' }))
    expect(prompt()).toBeNull()
    expect(localStorage.getItem('healthchecks-pocket.updates.skipped')).toBeNull()
  })

  it('checks at most once a day', async () => {
    localStorage.setItem('healthchecks-pocket.updates.lastCheck', String(Date.now() - 3600_000))
    const github = servers(NEWER)
    startApp()
    await listed()
    expect(github).not.toHaveBeenCalled()
  })

  it('stays quiet when this is the latest version, or GitHub can\'t be reached', async () => {
    for (const latest of [APP_VERSION, 403, 'offline'] as const) {
      localStorage.removeItem('healthchecks-pocket.updates.lastCheck')
      const github = servers(latest)
      const { unmount } = startApp()
      await listed()
      await waitFor(() => expect(github).toHaveBeenCalled())
      expect(prompt()).toBeNull()
      unmount()
    }
  })

  it('never checks when turned off, or in the web version', async () => {
    localStorage.setItem('healthchecks-pocket.updates.enabled', '0')
    let github = servers(NEWER)
    const { unmount } = startApp()
    await listed()
    expect(github).not.toHaveBeenCalled()
    unmount()

    localStorage.clear()
    platform.updatesSupported = false
    github = servers(NEWER)
    startApp({ hash: '#/settings' })
    await screen.findByText('Settings')
    expect(screen.queryByText('Updates')).toBeNull()
    expect(github).not.toHaveBeenCalled()
  })

  describe('in Settings', () => {
    const toggle = () => screen.getByRole('checkbox', { name: 'Check for updates once a day' }) as HTMLInputElement

    it('turns the daily check off and on', async () => {
      localStorage.setItem('healthchecks-pocket.updates.lastCheck', String(Date.now()))
      servers(NEWER)
      const { user } = startApp({ hash: '#/settings' })
      await screen.findByRole('checkbox', { name: 'Check for updates once a day' })
      expect(toggle().checked).toBe(true)
      expect(text(toggle().closest('.card'))).toContain('Asks GitHub (api.github.com) for the latest release. Nothing about you or your checks is sent.')
      await user.click(toggle())
      expect(localStorage.getItem('healthchecks-pocket.updates.enabled')).toBe('0')
      await user.click(toggle())
      expect(localStorage.getItem('healthchecks-pocket.updates.enabled')).toBe('1')
    })

    it('Check now: up to date, a newer version (even a skipped one), or GitHub unreachable', async () => {
      localStorage.setItem('healthchecks-pocket.updates.lastCheck', String(Date.now()))
      localStorage.setItem('healthchecks-pocket.updates.skipped', NEWER)
      servers(APP_VERSION)
      const { user, unmount } = startApp({ hash: '#/settings' })
      await user.click(await screen.findByRole('button', { name: 'Check now' }))
      expect(text(await screen.findByRole('status'))).toBe(`You're up to date (${APP_VERSION}).`)
      unmount()

      servers(NEWER)
      const second = startApp({ hash: '#/settings' })
      await second.user.click(await screen.findByRole('button', { name: 'Check now' }))
      await waitFor(() => expect(text(prompt())).toContain(`Healthchecks Pocket ${NEWER} is available`))
      second.unmount()

      servers('offline')
      const third = startApp({ hash: '#/settings' })
      await third.user.click(await screen.findByRole('button', { name: 'Check now' }))
      expect(text(await screen.findByRole('status'))).toBe("Couldn't reach GitHub. Try again later.")
    })
  })
})
