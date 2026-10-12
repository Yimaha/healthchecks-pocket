import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { APP_VERSION } from '../../src/core/app'
import { platform } from '../../src/platform'
import { check, NOW, readOnlyCheck } from '../fixtures/healthchecks'
import { account, answerConfirms, fakeServer, savedProjects, startApp, text } from '../helpers'

const home = account()
const work = account({ id: 'p2', name: 'Work', apiKey: 'key-work-1234', baseUrl: 'https://hc.example.org' })
const saved = savedProjects
const active = () => localStorage.getItem('healthchecks-pocket.active')
const heading = () => screen.getByRole('heading', { level: 1 }).textContent
const keyInput = () => screen.getByPlaceholderText('Paste API key') as HTMLInputElement
const nameInput = () => screen.getByPlaceholderText('Home lab') as HTMLInputElement
const button = (name: string | RegExp) => screen.getByRole('button', { name })
const projectRows = () => [...document.querySelectorAll('.project-select-row')]

const WEB_NOTICE =
  "Not encrypted in the browser. The web version keeps your API key in this browser's local storage. For encrypted storage, use the Android app."

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW })
})

describe('first launch', () => {
  it('asks for an API key, with the storage notice, and enables Add only once a key is typed', async () => {
    fakeServer([])
    const { user } = startApp({ accounts: [] })
    await screen.findByText(/Paste a project API key from healthchecks.io/)
    expect(heading()).toBe('Healthchecks Pocket')
    expect(text(document.querySelector('.notice'))).toBe(WEB_NOTICE)
    expect(button('Add project')).toHaveProperty('disabled', true)
    await user.type(keyInput(), 'k')
    expect(button('Add project')).toHaveProperty('disabled', false)
  })

  it('"Try the demo" adds a demo project without any network request', async () => {
    const server = fakeServer([])
    const { user } = startApp({ accounts: [] })
    await user.click(await screen.findByRole('button', { name: 'No key yet? Try the demo' }))
    expect(keyInput().value).toBe('demo')
    await user.click(button('Add project'))
    await waitFor(() => expect(document.querySelectorAll('.check-row').length).toBe(6))
    expect(window.location.hash).toBe('#/')
    expect(saved()).toEqual([expect.objectContaining({ name: 'Demo project', apiKey: 'demo', readOnly: false })])
    expect(server.requests).toEqual([])
  })

  it('checks a real key against the API before saving, then opens the project', async () => {
    const server = fakeServer([{ key: 'key-real', checks: [check] }])
    const { user } = startApp({ accounts: [] })
    await user.type(await screen.findByPlaceholderText('Home lab'), 'Servers')
    await user.type(keyInput(), '  key-real  ')
    await user.click(button('Add project'))
    await waitFor(() => expect(document.querySelectorAll('.check-row').length).toBe(1))
    expect(server.requests[0]).toMatchObject({ method: 'GET', path: '/api/v3/checks/', key: 'key-real' })
    const [p] = saved()
    expect(p).toMatchObject({ name: 'Servers', apiKey: 'key-real', baseUrl: 'https://healthchecks.io', readOnly: false })
    expect(active()).toBe(p.id)
  })

  it('names an unnamed project after its server and detects read-only keys', async () => {
    fakeServer([{ key: 'key-ro', checks: [readOnlyCheck] }])
    const { user } = startApp({ accounts: [] })
    await user.type(await screen.findByPlaceholderText('Paste API key'), 'key-ro')
    await user.click(button('Add project'))
    await waitFor(() => expect(saved()).toHaveLength(1))
    expect(saved()[0]).toMatchObject({ name: 'healthchecks.io', readOnly: true })
  })

  it('rejects a bad key and saves nothing', async () => {
    fakeServer([{ key: 'key-real', checks: [check] }])
    const { user } = startApp({ accounts: [] })
    await user.type(await screen.findByPlaceholderText('Paste API key'), 'wrong')
    await user.click(button('Add project'))
    expect(text(await screen.findByRole('alert'))).toBe('API key rejected. Check it in Settings.')
    expect(saved()).toEqual([])
    expect(button('Add project')).toHaveProperty('disabled', false)
  })

  it('supports a self-hosted server (trailing slash trimmed)', async () => {
    const server = fakeServer([{ key: 'key-self', checks: [check] }], 'https://hc.example.org')
    const { user } = startApp({ accounts: [] })
    await user.click(await screen.findByRole('button', { name: 'Using a self-hosted server?' }))
    const serverInput = screen.getByRole('textbox', { name: /Server/ }) as HTMLInputElement
    expect(serverInput.value).toBe('https://healthchecks.io')
    await user.clear(serverInput)
    await user.type(serverInput, 'https://hc.example.org/')
    await user.type(keyInput(), 'key-self')
    await user.click(button('Add project'))
    await waitFor(() => expect(saved()).toHaveLength(1))
    expect(saved()[0]).toMatchObject({ name: 'hc.example.org', baseUrl: 'https://hc.example.org' })
    expect(server.requests[0].path).toBe('/api/v3/checks/')
  })

  it('explains an unreachable server', async () => {
    fakeServer([], 'https://healthchecks.io')
    const { user } = startApp({ accounts: [] })
    await user.click(await screen.findByRole('button', { name: 'Using a self-hosted server?' }))
    const serverInput = screen.getByRole('textbox', { name: /Server/ })
    await user.clear(serverInput)
    await user.type(serverInput, 'https://offline.example.net')
    await user.type(keyInput(), 'k')
    await user.click(button('Add project'))
    expect(text(await screen.findByRole('alert'))).toBe("Can't reach offline.example.net. Check your connection.")
  })

  it('hides the key unless shown', async () => {
    fakeServer([])
    const { user } = startApp({ accounts: [] })
    await screen.findByPlaceholderText('Paste API key')
    expect(keyInput().type).toBe('password')
    await user.click(button('Show'))
    expect(keyInput().type).toBe('text')
    await user.click(button('Hide'))
    expect(keyInput().type).toBe('password')
  })
})

describe('settings', () => {
  const projects = () => projectRows().map((r) => text(r))
  const openSettings = async () => {
    const r = startApp({ accounts: [home, work, account({ id: 'p3', name: 'Demo', apiKey: 'demo' })], active: 'p1', hash: '#/settings' })
    await waitFor(() => expect(projectRows()).toHaveLength(3))
    return r
  }

  it('lists projects with server, key type and the end of the key; the active one is ticked', async () => {
    fakeServer([])
    await openSettings()
    expect(heading()).toBe('Settings')
    expect(projects()).toEqual([
      'Home lab healthchecks.io · regular key · …home',
      'Work hc.example.org · regular key · …1234',
      'Demo healthchecks.io · demo · …demo',
    ])
    expect(projectRows().map((r) => !!r.querySelector('.project-active svg'))).toEqual([true, false, false])
    expect(screen.queryByPlaceholderText('Paste API key')).toBeNull() // adding is its own page
    expect(text(document.querySelector('.footnote'))).toBe(
      `API keys are stored only on this device (browser storage, not encrypted) and sent only to the server you entered. Version ${APP_VERSION}. Unofficial client, not affiliated with Healthchecks.io.`,
    )
  })

  it('tapping a project switches to it and opens its checks', async () => {
    fakeServer([{ key: 'key-work-1234', checks: [{ ...check, name: 'payroll' }] }], 'https://hc.example.org')
    const { user } = await openSettings()
    await user.click(projectRows()[1])
    expect(window.location.hash).toBe('#/')
    expect(active()).toBe('p2')
    await waitFor(() => expect(text(document.querySelector('.check-name'))).toBe('payroll'))
  })

  it('links out to healthchecks.io for account matters', async () => {
    fakeServer([])
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    await openSettings()
    const links = [...document.querySelectorAll('.card-links .row-link')]
    expect(links.map((l) => text(l))).toEqual(['Dashboard, projects & integrations', 'Account settings', 'About API keys'])
    links.forEach((l) => fireEvent.click(l))
    expect(openSpy.mock.calls.map((c) => c[0])).toEqual([
      'https://healthchecks.io/',
      'https://healthchecks.io/accounts/profile/',
      'https://healthchecks.io/docs/api/',
    ])
  })

  describe('editing a project', () => {
    it('opens a prefilled form with the key hidden and the storage notice', async () => {
      fakeServer([])
      const { user } = await openSettings()
      await user.click(screen.getByRole('link', { name: 'Edit Work' }))
      expect(window.location.hash).toBe('#/settings/project/p2')
      expect(heading()).toBe('Edit project')
      expect(nameInput().value).toBe('Work')
      expect(keyInput()).toMatchObject({ value: 'key-work-1234', type: 'password' })
      expect((screen.getByRole('textbox', { name: /Server/ }) as HTMLInputElement).value).toBe('https://hc.example.org')
      await waitFor(() => expect(text(document.querySelector('.notice'))).toBe(WEB_NOTICE))
      expect(screen.getAllByText(/Key type: regular key\. Changing the key or server re-checks it before saving\./)).toHaveLength(1)
    })

    it('renaming saves without re-checking the key', async () => {
      const server = fakeServer([])
      const { user } = await openSettings()
      await user.click(screen.getByRole('link', { name: 'Edit Work' }))
      await user.clear(nameInput())
      await user.type(nameInput(), 'Office')
      await user.click(button('Save changes'))
      expect(window.location.hash).toBe('#/settings')
      await waitFor(() => expect(text(projectRows()[1])).toBe('Office hc.example.org · regular key · …1234'))
      expect(saved()[1]).toMatchObject({ id: 'p2', name: 'Office', apiKey: 'key-work-1234' })
      expect(server.requests).toEqual([])
    })

    it('a new key is checked first; a bad one is rejected and nothing changes', async () => {
      const server = fakeServer([{ key: 'key-new', checks: [readOnlyCheck] }], 'https://hc.example.org')
      const { user } = await openSettings()
      await user.click(screen.getByRole('link', { name: 'Edit Work' }))
      await user.clear(keyInput())
      await user.type(keyInput(), 'key-bad')
      await user.click(button('Save changes'))
      expect(text(await screen.findByRole('alert'))).toBe('API key rejected. Check it in Settings.')
      expect(saved()[1].apiKey).toBe('key-work-1234')

      await user.clear(keyInput())
      await user.type(keyInput(), 'key-new')
      await user.click(button('Save changes'))
      await waitFor(() => expect(saved()[1]).toMatchObject({ apiKey: 'key-new', readOnly: true }))
      expect(server.requests.map((r) => r.key)).toEqual(['key-bad', 'key-new'])
    })

    it('says so for a project that no longer exists', async () => {
      fakeServer([])
      startApp({ accounts: [home], hash: '#/settings/project/gone' })
      expect(await screen.findByText('That project no longer exists.')).toBeTruthy()
    })
  })

  describe('removing a project', () => {
    const remove = async (user: Awaited<ReturnType<typeof openSettings>>['user'], name: string) => {
      await user.click(screen.getByRole('link', { name: `Edit ${name}` }))
      await user.click(button('Remove project'))
    }

    it('asks first and does nothing if cancelled', async () => {
      fakeServer([])
      const asked = answerConfirms(false)
      const { user } = await openSettings()
      await remove(user, 'Work')
      expect(asked).toEqual(['Remove "Work" from this device?'])
      expect(saved()).toHaveLength(3)
    })

    it('removes it; removing the open project switches to another', async () => {
      fakeServer([])
      answerConfirms(true, true)
      const { user } = await openSettings()
      await remove(user, 'Work')
      await waitFor(() => expect(projectRows()).toHaveLength(2))
      expect(saved().map((a) => a.name)).toEqual(['Home lab', 'Demo'])
      expect(active()).toBe('p1')
      await remove(user, 'Home lab')
      await waitFor(() => expect(projectRows()).toHaveLength(1))
      expect(active()).toBe('p3')
    })

    it('removing the last project shows the empty list, pointing to Settings', async () => {
      fakeServer([])
      answerConfirms(true)
      const { user } = startApp({ accounts: [home], hash: '#/settings' })
      await user.click(await screen.findByRole('link', { name: 'Edit Home lab' }))
      await user.click(button('Remove project'))
      expect(await screen.findByText('Set up a project in Settings')).toBeTruthy()
      expect(window.location.hash).toBe('#/')
      expect(saved()).toEqual([])
      expect(active()).toBeNull()
    })
  })

  describe('adding a project', () => {
    it('has its own page, with the storage notice', async () => {
      fakeServer([])
      const { user } = await openSettings()
      await user.click(screen.getByRole('link', { name: 'Add project' }))
      expect(window.location.hash).toBe('#/settings/add')
      expect(heading()).toBe('Add project')
      expect(text(document.querySelector('.notice'))).toBe(WEB_NOTICE)
    })

    it('adds the project and opens it', async () => {
      fakeServer([{ key: 'key-third', checks: [{ ...check, name: 'third-check' }] }])
      const { user } = await openSettings()
      await user.click(screen.getByRole('link', { name: 'Add project' }))
      await user.type(nameInput(), 'Third')
      await user.type(keyInput(), 'key-third')
      await user.click(button('Add project'))
      await waitFor(() => expect(text(document.querySelector('.check-name'))).toBe('third-check'))
      expect(saved().map((a) => a.name)).toEqual(['Home lab', 'Work', 'Demo', 'Third'])
      expect(active()).toBe(saved()[3].id)
    })
  })
})

describe('storage notice on the phone', () => {
  const original = platform.secretProtection
  afterEach(() => {
    platform.secretProtection = original
  })

  it.each([
    ['keystore', 'Android Keystore'],
    ['keychain', 'iOS Keychain'],
  ] as const)('%s: says the key is encrypted and must be re-added on a new phone', async (protection, store) => {
    platform.secretProtection = protection
    fakeServer([])
    startApp({ accounts: [] })
    await screen.findByText(/Paste a project API key/)
    expect(text(document.querySelector('.notice'))).toBe(
      `Your API key is encrypted on this device with a key held in the ${store} (Capacitor Secure Storage plugin). ` +
        "That key never leaves this phone, so the API key isn't backed up or moved to a new phone. The project's name and server are: on a new phone, you only paste the key again.",
    )
    expect(document.querySelector('.notice-warn')).toBeNull()
  })

  it('the settings footnote says keys are encrypted', async () => {
    platform.secretProtection = 'keystore'
    fakeServer([])
    startApp({ accounts: [home], hash: '#/settings' })
    await waitFor(() => expect(text(document.querySelector('.footnote'))).toContain('stored only on this device (encrypted)'))
  })
})

describe('a project whose key isn\'t on this device (moved to a new phone)', () => {
  const keyless = { ...work, apiKey: '' }

  it('asks for the key instead of loading checks', async () => {
    const server = fakeServer([])
    startApp({ accounts: [keyless], hash: '#/' })
    expect(text(await screen.findByRole('heading', { level: 2 }))).toBe('Add the API key for Work')
    expect(screen.getByRole('link', { name: 'Add API key' }).getAttribute('href')).toBe('#/settings/project/p2')
    expect(screen.getByRole('link', { name: 'Settings' }).getAttribute('href')).toBe('#/settings')
    expect(server.requests).toEqual([])
  })

  it('shows "API key needed" in Settings', async () => {
    fakeServer([])
    startApp({ accounts: [home, keyless], hash: '#/settings' })
    await waitFor(() => expect(projectRows()).toHaveLength(2))
    expect(text(projectRows()[1])).toBe('Work hc.example.org · API key needed')
  })

  it('takes the key on the edit page, checks it, and opens the project', async () => {
    const server = fakeServer([{ key: 'key-work-1234', checks: [check] }], 'https://hc.example.org')
    const { user } = startApp({ accounts: [keyless], hash: '#/settings/project/p2' })
    expect(await screen.findByText(/This project's API key isn't on this device/)).toBeTruthy()
    expect(keyInput().value).toBe('')
    expect(document.querySelector('.notice')).not.toBeNull()
    expect(screen.queryByText(/Key type:/)).toBeNull()
    await user.type(keyInput(), 'key-work-1234')
    await user.click(button('Save changes'))
    await waitFor(() => expect(saved()[0].apiKey).toBe('key-work-1234'))
    expect(server.requests.map((r) => r.key)).toEqual(['key-work-1234'])
  })
})

describe('API key protection setting', () => {
  const original = platform.secretProtection
  beforeEach(() => {
    platform.secretProtection = 'keystore'
  })
  afterEach(() => {
    platform.secretProtection = original
  })
  const toggle = () => screen.getByRole('checkbox', { name: /Keep API keys on this device only/ }) as HTMLInputElement
  const footnote = () => text(document.querySelector('.footnote'))

  it('is on by default, and isn\'t offered in the browser (nothing to encrypt with)', async () => {
    fakeServer([])
    const { unmount } = startApp({ accounts: [home], hash: '#/settings' })
    await waitFor(() => expect(toggle().checked).toBe(true))
    expect(text(toggle().closest('.card'))).toContain('Encrypted with a key that never leaves this phone.')
    unmount()
    platform.secretProtection = 'none'
    startApp({ accounts: [home], hash: '#/settings' })
    await screen.findByText('Settings')
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('asks before turning it off, and does nothing if cancelled', async () => {
    fakeServer([])
    const asked = answerConfirms(false)
    const { user } = startApp({ accounts: [home], hash: '#/settings' })
    await waitFor(() => expect(toggle().checked).toBe(true))
    await user.click(toggle())
    expect(asked[0]).toMatch(/^Save API keys unencrypted with your settings\?/)
    expect(toggle().checked).toBe(true)
    expect(localStorage.getItem('healthchecks-pocket.carriedKeys')).toBeNull()
  })

  it('turned off, keys are saved with the settings so they move to a new phone; back on moves them back', async () => {
    fakeServer([])
    answerConfirms(true)
    const { user } = startApp({ accounts: [home], hash: '#/settings' })
    await waitFor(() => expect(toggle().checked).toBe(true))
    await user.click(toggle())
    expect(toggle().checked).toBe(false)
    await waitFor(() => expect(JSON.parse(localStorage.getItem('healthchecks-pocket.carriedKeys')!)).toEqual({ p1: 'key-home' }))
    expect(localStorage.getItem('healthchecks-pocket.apiKey.p1')).toBeNull()
    expect(footnote()).toContain('API keys are saved with your settings (not encrypted)')

    await user.click(toggle())
    await waitFor(() => expect(localStorage.getItem('healthchecks-pocket.apiKey.p1')).toBe('key-home'))
    expect(localStorage.getItem('healthchecks-pocket.carriedKeys')).toBeNull()
    expect(footnote()).toContain('API keys are stored only on this device (encrypted)')
  })

  it('when off (e.g. chosen in onboarding), the "encrypted" notice never shows, not even while the choice loads', async () => {
    localStorage.setItem('healthchecks-pocket.keys.deviceOnly', '0')
    fakeServer([])
    const seen: string[] = []
    const observer = new MutationObserver(() => {
      const green = document.querySelector('.notice:not(.notice-warn)')
      if (green) seen.push(green.textContent ?? '')
    })
    observer.observe(document.body, { childList: true, subtree: true })
    startApp({ accounts: [] })
    await waitFor(() => expect(document.querySelector('.notice-warn')).not.toBeNull())
    observer.disconnect()
    expect(seen).toEqual([])
    expect(text(document.querySelector('.notice'))).toContain('Your API key will be saved unencrypted')
  })

  it('editing a project reminds how its key is stored, following the setting', async () => {
    fakeServer([])
    const { unmount } = startApp({ accounts: [home], hash: '#/settings/project/p1' })
    await waitFor(() => expect(text(document.querySelector('.notice'))).toMatch(/^Your API key is encrypted on this device/))
    expect(document.querySelector('.notice-warn')).toBeNull()
    unmount()

    localStorage.setItem('healthchecks-pocket.keys.deviceOnly', '0')
    startApp({ accounts: [home], hash: '#/settings/project/p1' })
    await waitFor(() => expect(text(document.querySelector('.notice-warn'))).toBe(
      'Your API key is saved unencrypted with your settings, so it moves to a new phone with Android backup and transfer. You chose this in Settings (API keys).',
    ))
  })

  it('when off, adding a project warns that its key is saved unencrypted', async () => {
    localStorage.setItem('healthchecks-pocket.keys.deviceOnly', '0')
    fakeServer([])
    startApp({ accounts: [home], hash: '#/settings/add' })
    await waitFor(() => expect(text(document.querySelector('.notice-warn'))).toBe(
      'Your API key will be saved unencrypted with your settings, so it moves to a new phone with Android backup and transfer. You chose this in Settings (API keys).',
    ))
  })
})

describe('appearance', () => {
  const picker = () => screen.getByRole('combobox', { name: /^Theme/ }) as HTMLSelectElement
  const theme = () => document.documentElement.dataset.theme

  it('offers four modes in a dropdown, Auto by default, and applies a choice at once', async () => {
    fakeServer([])
    const { user } = startApp({ accounts: [home], hash: '#/settings' })
    await screen.findByRole('combobox', { name: /^Theme/ })
    expect([...picker().options].map((o) => o.textContent))
      .toEqual(['Auto: dark from 19:00 to 07:00', 'Light', 'Dark', 'Follow system'])
    expect(picker().value).toBe('auto')

    await user.selectOptions(picker(), 'dark')
    expect(theme()).toBe('dark')
    expect(localStorage.getItem('healthchecks-pocket.theme')).toBe('dark')
    await user.selectOptions(picker(), 'light')
    expect(theme()).toBe('light')
  })

  it('remembers the choice', async () => {
    localStorage.setItem('healthchecks-pocket.theme', 'dark')
    fakeServer([])
    startApp({ accounts: [home], hash: '#/settings' })
    await waitFor(() => expect(picker().value).toBe('dark'))
    expect(theme()).toBe('dark')
  })

  it('has a titled dropdown for the theme and one for the background', async () => {
    fakeServer([])
    startApp({ accounts: [home], hash: '#/settings' })
    await screen.findByRole('combobox', { name: /^Theme/ })
    expect([...document.querySelectorAll('.appearance .field-title')].map((t) => t.textContent)).toEqual(['Theme', 'Background'])
    expect(document.querySelector('.appearance .hint')).toBeNull()
  })

  it('Background: northern lights always by default, or while loading, breathing, or none; applies at once and is remembered', async () => {
    fakeServer([])
    const { user, unmount } = startApp({ accounts: [home], hash: '#/settings' })
    const background = () => screen.getByRole('combobox', { name: /^Background/ }) as HTMLSelectElement
    await screen.findByRole('combobox', { name: /^Background/ })
    expect([...background().options].map((o) => o.textContent))
      .toEqual(['Northern lights, always', 'Northern lights while loading', 'Northern lights, breathing', 'None'])
    expect(background().value).toBe('always')
    expect(document.querySelector('.aurora')).not.toBeNull() // always, even with nothing loading

    await user.selectOptions(background(), 'breathing')
    expect(document.querySelector('.aurora')!.classList.contains('aurora-breathing')).toBe(true)
    await user.selectOptions(background(), 'off')
    expect(document.querySelector('.aurora')).toBeNull()
    expect(localStorage.getItem('healthchecks-pocket.lights')).toBe('off')
    unmount()

    startApp({ accounts: [home], hash: '#/settings' })
    await waitFor(() => expect(background().value).toBe('off'))
    expect(document.querySelector('.aurora')).toBeNull()
  })

  it('auto follows the clock, and switches when the time comes', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-12T18:59:30'), shouldAdvanceTime: true })
    fakeServer([])
    startApp({ accounts: [home], hash: '#/settings' })
    await waitFor(() => expect(theme()).toBe('light'))
    vi.advanceTimersByTime(60_000)
    expect(theme()).toBe('dark')
  })

  it('follow system tracks the system setting as it changes', async () => {
    const listeners: (() => void)[] = []
    const query = { matches: true, addEventListener: (_: string, f: () => void) => listeners.push(f), removeEventListener: () => {} }
    vi.stubGlobal('matchMedia', () => query)
    localStorage.setItem('healthchecks-pocket.theme', 'system')
    fakeServer([])
    startApp({ accounts: [home], hash: '#/settings' })
    await waitFor(() => expect(theme()).toBe('dark'))
    query.matches = false
    listeners.forEach((f) => f())
    expect(theme()).toBe('light')
  })
})

describe('no projects (all removed)', () => {
  const noProjects = () => {
    localStorage.setItem('healthchecks-pocket.projects', '[]') // had projects once
    return startApp({ accounts: [] })
  }

  it('shows the empty list with a big hint and an arrow to Settings', async () => {
    fakeServer([])
    noProjects()
    expect(text(await screen.findByText('Set up a project in Settings'))).toBe('Set up a project in Settings')
    expect(document.querySelector('.no-projects-title')!.textContent).toBe('Set up a project in Settings')
    expect(text(document.querySelector('.no-projects-text'))).toBe(
      'Tap up here, then Add project , to see your checks. No account yet? Try the demo there.',
    )
    expect(document.querySelector('.no-projects-arrow')?.getAttribute('aria-hidden')).toBe('true')
    expect(screen.getByRole('link', { name: 'Settings' }).getAttribute('href')).toBe('#/settings')
    expect(screen.queryByPlaceholderText('Paste API key')).toBeNull()
  })

  it('Settings, adding a project and Risky actions still work; a new project opens its checks', async () => {
    fakeServer([{ key: 'key-home', checks: [check] }])
    const { user } = noProjects()
    await user.click(await screen.findByRole('link', { name: 'Settings' }))
    expect(screen.getByRole('link', { name: 'Risky actions' })).toBeTruthy()
    await user.click(screen.getByRole('link', { name: 'Add project' }))
    await user.type(screen.getByPlaceholderText('Paste API key'), 'key-home')
    await user.click(button('Add project'))
    await waitFor(() => expect(text(document.querySelector('.check-name'))).toBe('backup-server'))
  })

  it('a fresh install (never had a project) gets the add-project form instead', async () => {
    fakeServer([])
    startApp({ accounts: [] })
    expect(await screen.findByText(/Paste a project API key/)).toBeTruthy()
    expect(screen.queryByText('Set up a project in Settings')).toBeNull()
  })
})
