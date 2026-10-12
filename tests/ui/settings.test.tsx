import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account } from '../../src/core/types'
import { platform } from '../../src/platform'
import { check, NOW, readOnlyCheck } from '../fixtures/healthchecks'
import { account, answerConfirms, fakeServer, startApp, text } from '../helpers'

const home = account()
const work = account({ id: 'p2', name: 'Work', apiKey: 'key-work-1234', baseUrl: 'https://hc.example.org' })
const saved = (): Account[] => JSON.parse(localStorage.getItem('healthchecks-pocket.accounts') ?? '[]')
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
      'API keys are stored only on this device (browser storage, not encrypted) and sent only to the server you entered. Unofficial client, not affiliated with Healthchecks.io.',
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
    const links = [...document.querySelectorAll('.row-link')]
    expect(links.map((l) => text(l))).toEqual(['Dashboard, projects & integrations', 'Account settings', 'About API keys'])
    links.forEach((l) => fireEvent.click(l))
    expect(openSpy.mock.calls.map((c) => c[0])).toEqual([
      'https://healthchecks.io/',
      'https://healthchecks.io/accounts/profile/',
      'https://healthchecks.io/docs/api/',
    ])
  })

  describe('editing a project', () => {
    it('opens a prefilled form with the key hidden and no storage notice', async () => {
      fakeServer([])
      const { user } = await openSettings()
      await user.click(screen.getByRole('link', { name: 'Edit Work' }))
      expect(window.location.hash).toBe('#/settings/project/p2')
      expect(heading()).toBe('Edit project')
      expect(nameInput().value).toBe('Work')
      expect(keyInput()).toMatchObject({ value: 'key-work-1234', type: 'password' })
      expect((screen.getByRole('textbox', { name: /Server/ }) as HTMLInputElement).value).toBe('https://hc.example.org')
      expect(document.querySelector('.notice')).toBeNull()
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

    it('removing the last project returns to first-launch setup', async () => {
      fakeServer([])
      answerConfirms(true)
      const { user } = startApp({ accounts: [home], hash: '#/settings' })
      await user.click(await screen.findByRole('link', { name: 'Edit Home lab' }))
      await user.click(button('Remove project'))
      expect(await screen.findByText(/Paste a project API key from healthchecks.io/)).toBeTruthy()
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
        "That key never leaves this phone, so the API key isn't backed up or synced: on a new phone or after reinstalling the app, you'll need to add this project again.",
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
